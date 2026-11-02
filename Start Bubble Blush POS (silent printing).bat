@echo off
rem Same as "Start Bubble Blush POS.bat" but cup stickers (and anything else that
rem uses the print window) go WITHOUT a dialog to the Windows DEFAULT printer.
rem Bills already print directly through the print helper.
rem Close all POS windows before using this.
call "%~dp0Start Bubble Blush POS.bat" silent
