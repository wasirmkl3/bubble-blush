# Bubble Blush Print Helper
# Sends bills straight to the receipt printer (RAW ESC/POS), so the paper stops
# right after the last line instead of feeding a long blank "page".
# Listens on 127.0.0.1 only. Started automatically by "Start Bubble Blush POS.bat".
param(
  [int]$Port = 17846,
  [string]$FakeDir = ''   # for testing without a printer: jobs are written to this folder
)
$ErrorActionPreference = 'Stop'

$logDir = if ($env:LOCALAPPDATA) { Join-Path $env:LOCALAPPDATA 'BubbleBlushPOS' } else { [IO.Path]::GetTempPath() }
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
$logFile = Join-Path $logDir 'print-helper.log'

$source = @'
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Runtime.InteropServices;
using System.Text;

namespace BubbleBlush
{
    public static class RawPrinter
    {
        [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
        public class DOCINFO
        {
            [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
            [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
            [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct PRINTER_INFO_4
        {
            public IntPtr pPrinterName;
            public IntPtr pServerName;
            public int Attributes;
        }

        [DllImport("winspool.drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool OpenPrinter(string name, out IntPtr handle, IntPtr defaults);
        [DllImport("winspool.drv", SetLastError = true)]
        static extern bool ClosePrinter(IntPtr handle);
        [DllImport("winspool.drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern int StartDocPrinter(IntPtr handle, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFO info);
        [DllImport("winspool.drv", SetLastError = true)]
        static extern bool EndDocPrinter(IntPtr handle);
        [DllImport("winspool.drv", SetLastError = true)]
        static extern bool StartPagePrinter(IntPtr handle);
        [DllImport("winspool.drv", SetLastError = true)]
        static extern bool EndPagePrinter(IntPtr handle);
        [DllImport("winspool.drv", SetLastError = true)]
        static extern bool WritePrinter(IntPtr handle, byte[] data, int count, out int written);
        [DllImport("winspool.drv", EntryPoint = "EnumPrintersW", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool EnumPrinters(int flags, string name, int level, IntPtr buffer, int size, out int needed, out int returned);
        [DllImport("winspool.drv", EntryPoint = "GetDefaultPrinterW", SetLastError = true, CharSet = CharSet.Unicode)]
        static extern bool GetDefaultPrinter(StringBuilder buffer, ref int size);

        public static void Send(string printer, byte[] data, string docName)
        {
            IntPtr h;
            if (!OpenPrinter(printer, out h, IntPtr.Zero))
                throw new Exception("Printer \"" + printer + "\" not found (" + new Win32Exception(Marshal.GetLastWin32Error()).Message + ")");
            try
            {
                DOCINFO di = new DOCINFO();
                di.pDocName = docName;
                di.pDataType = "RAW";
                if (StartDocPrinter(h, 1, di) == 0)
                    throw new Exception("Printer refused the job: " + new Win32Exception(Marshal.GetLastWin32Error()).Message);
                try
                {
                    StartPagePrinter(h);
                    int written;
                    if (!WritePrinter(h, data, data.Length, out written) || written != data.Length)
                        throw new Exception("Could not send data: " + new Win32Exception(Marshal.GetLastWin32Error()).Message);
                    EndPagePrinter(h);
                }
                finally { EndDocPrinter(h); }
            }
            finally { ClosePrinter(h); }
        }

        public static List<string> List()
        {
            List<string> names = new List<string>();
            const int flags = 2 | 4; // PRINTER_ENUM_LOCAL | PRINTER_ENUM_CONNECTIONS
            int needed, returned;
            EnumPrinters(flags, null, 4, IntPtr.Zero, 0, out needed, out returned);
            if (needed <= 0) return names;
            IntPtr buf = Marshal.AllocHGlobal(needed);
            try
            {
                if (!EnumPrinters(flags, null, 4, buf, needed, out needed, out returned)) return names;
                int size = Marshal.SizeOf(typeof(PRINTER_INFO_4));
                for (int i = 0; i < returned; i++)
                {
                    PRINTER_INFO_4 info = (PRINTER_INFO_4)Marshal.PtrToStructure(new IntPtr(buf.ToInt64() + i * size), typeof(PRINTER_INFO_4));
                    names.Add(Marshal.PtrToStringUni(info.pPrinterName));
                }
            }
            finally { Marshal.FreeHGlobal(buf); }
            return names;
        }

        public static string Default()
        {
            int size = 0;
            GetDefaultPrinter(null, ref size);
            if (size <= 0) return "";
            StringBuilder sb = new StringBuilder(size);
            return GetDefaultPrinter(sb, ref size) ? sb.ToString() : "";
        }
    }

    public static class PrintServer
    {
        public static string FakeDir = "";
        public static string LogFile = "";
        const int MaxBody = 8 * 1024 * 1024;

        static void Log(string msg)
        {
            try { if (LogFile != "") File.AppendAllText(LogFile, DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss") + "  " + msg + Environment.NewLine); }
            catch { }
        }

        static string Json(string s)
        {
            if (s == null) return "null";
            StringBuilder sb = new StringBuilder("\"");
            foreach (char c in s)
            {
                if (c == '"' || c == '\\') { sb.Append('\\'); sb.Append(c); }
                else if (c < 32) sb.Append("\\u" + ((int)c).ToString("x4"));
                else sb.Append(c);
            }
            return sb.Append('"').ToString();
        }

        /* Returns false if another helper is already running on this port. */
        public static bool Run(int port)
        {
            TcpListener listener = new TcpListener(IPAddress.Loopback, port);
            try { listener.Start(); }
            catch (SocketException) { return false; }
            Log("Print helper started on 127.0.0.1:" + port);
            while (true)
            {
                TcpClient client = listener.AcceptTcpClient();
                try { Handle(client); }
                catch (Exception e) { Log("Request error: " + e.Message); }
                finally { client.Close(); }
            }
        }

        static void Handle(TcpClient client)
        {
            client.ReceiveTimeout = 10000;
            client.SendTimeout = 10000;
            NetworkStream stream = client.GetStream();

            // --- read headers ---
            MemoryStream head = new MemoryStream();
            int matched = 0;
            while (matched < 4)
            {
                int b = stream.ReadByte();
                if (b < 0) return;
                head.WriteByte((byte)b);
                if (head.Length > 32768) return;
                if ((matched == 0 || matched == 2) && b == '\r') matched++;
                else if ((matched == 1 || matched == 3) && b == '\n') matched++;
                else matched = (b == '\r') ? 1 : 0;
            }
            string[] lines = Encoding.ASCII.GetString(head.ToArray()).Split(new string[] { "\r\n" }, StringSplitOptions.None);
            string[] first = lines[0].Split(' ');
            if (first.Length < 2) return;
            string method = first[0].ToUpperInvariant();
            string target = first[1];
            Dictionary<string, string> headers = new Dictionary<string, string>();
            for (int i = 1; i < lines.Length; i++)
            {
                int c = lines[i].IndexOf(':');
                if (c > 0) headers[lines[i].Substring(0, c).Trim().ToLowerInvariant()] = lines[i].Substring(c + 1).Trim();
            }

            // --- security: loopback host only; browsers may only call us from the local POS file ---
            string host = headers.ContainsKey("host") ? headers["host"].ToLowerInvariant() : "";
            if (!(host.StartsWith("127.0.0.1") || host.StartsWith("localhost"))) { Reply(stream, 403, "{\"ok\":false,\"error\":\"bad host\"}"); return; }
            if (headers.ContainsKey("origin") && headers["origin"] != "null" && !headers["origin"].StartsWith("file://"))
            { Reply(stream, 403, "{\"ok\":false,\"error\":\"origin not allowed\"}"); return; }

            // --- body ---
            byte[] body = new byte[0];
            if (headers.ContainsKey("content-length"))
            {
                int len = int.Parse(headers["content-length"]);
                if (len > MaxBody) { Reply(stream, 413, "{\"ok\":false,\"error\":\"too large\"}"); return; }
                body = new byte[len];
                int read = 0;
                while (read < len)
                {
                    int n = stream.Read(body, read, len - read);
                    if (n <= 0) return;
                    read += n;
                }
            }

            string path = target;
            string query = "";
            int q = target.IndexOf('?');
            if (q >= 0) { path = target.Substring(0, q); query = target.Substring(q + 1); }
            Dictionary<string, string> args = new Dictionary<string, string>();
            foreach (string part in query.Split('&'))
            {
                if (part == "") continue;
                int eq = part.IndexOf('=');
                string k = eq >= 0 ? part.Substring(0, eq) : part;
                string v = eq >= 0 ? part.Substring(eq + 1) : "";
                args[Uri.UnescapeDataString(k)] = Uri.UnescapeDataString(v.Replace('+', ' '));
            }

            if (method == "OPTIONS") { Reply(stream, 204, ""); return; }
            if (method == "GET" && path == "/health")
            {
                Reply(stream, 200, "{\"ok\":true,\"app\":\"bubble-blush-print-helper\",\"version\":1}");
                return;
            }
            if (method == "GET" && path == "/printers")
            {
                List<string> names;
                string def;
                if (FakeDir != "") { names = new List<string>(new string[] { "RONGTA RP58 Printer", "Label Printer" }); def = "RONGTA RP58 Printer"; }
                else { names = RawPrinter.List(); def = RawPrinter.Default(); }
                StringBuilder sb = new StringBuilder("{\"ok\":true,\"default\":" + Json(def) + ",\"printers\":[");
                for (int i = 0; i < names.Count; i++) { if (i > 0) sb.Append(','); sb.Append(Json(names[i])); }
                Reply(stream, 200, sb.Append("]}").ToString());
                return;
            }
            if (method == "POST" && path == "/print")
            {
                string printer = args.ContainsKey("printer") ? args["printer"] : "";
                string doc = args.ContainsKey("doc") ? args["doc"] : "Bubble Blush bill";
                if (printer == "") { Reply(stream, 400, "{\"ok\":false,\"error\":\"No printer selected\"}"); return; }
                if (body.Length == 0) { Reply(stream, 400, "{\"ok\":false,\"error\":\"Nothing to print\"}"); return; }
                try
                {
                    if (FakeDir != "") File.WriteAllBytes(Path.Combine(FakeDir, "job-" + DateTime.Now.Ticks + ".bin"), body);
                    else RawPrinter.Send(printer, body, doc);
                    Log("Printed " + body.Length + " bytes to " + printer);
                    Reply(stream, 200, "{\"ok\":true,\"bytes\":" + body.Length + "}");
                }
                catch (Exception e)
                {
                    Log("Print failed on " + printer + ": " + e.Message);
                    Reply(stream, 500, "{\"ok\":false,\"error\":" + Json(e.Message) + "}");
                }
                return;
            }
            Reply(stream, 404, "{\"ok\":false,\"error\":\"not found\"}");
        }

        static void Reply(NetworkStream stream, int status, string json)
        {
            string reason = status == 200 ? "OK" : status == 204 ? "No Content" : "Error";
            byte[] payload = Encoding.UTF8.GetBytes(json);
            string head = "HTTP/1.1 " + status + " " + reason + "\r\n" +
                "Content-Type: application/json; charset=utf-8\r\n" +
                "Access-Control-Allow-Origin: *\r\n" +
                "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n" +
                "Access-Control-Allow-Headers: *\r\n" +
                "Access-Control-Allow-Private-Network: true\r\n" +
                "Cache-Control: no-store\r\n" +
                "Connection: close\r\n" +
                "Content-Length: " + payload.Length + "\r\n\r\n";
            byte[] h = Encoding.ASCII.GetBytes(head);
            stream.Write(h, 0, h.Length);
            if (status != 204) stream.Write(payload, 0, payload.Length);
            stream.Flush();
        }
    }
}
'@

try {
  if (-not ('BubbleBlush.PrintServer' -as [type])) { Add-Type -TypeDefinition $source -Language CSharp }
  [BubbleBlush.PrintServer]::LogFile = $logFile
  [BubbleBlush.PrintServer]::FakeDir = $FakeDir
  if (-not [BubbleBlush.PrintServer]::Run($Port)) { exit 0 }   # already running
} catch {
  Add-Content -Path $logFile -Value ("{0}  FATAL: {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $_.Exception.Message)
  exit 1
}
