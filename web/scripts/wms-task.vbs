' ebut WMS runner launcher -- runs wms-task.cmd with no console window.
' Task Scheduler calls: wscript.exe wms-task.vbs push|pull|both
' NOTE: keep this file ASCII-only (wscript reads it in the ANSI codepage).
Dim shell, fso, here
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
Set shell = CreateObject("WScript.Shell")
shell.Run """" & here & "\wms-task.cmd"" " & WScript.Arguments(0), 0, False
