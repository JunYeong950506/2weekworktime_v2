Option Explicit

Dim shell, fso, scriptDir, cmdPath, command, exitCode

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

scriptDir = fso.GetParentFolderName(WScript.ScriptFullName)
cmdPath = fso.BuildPath(scriptDir, "run_worker.cmd")

If Not fso.FileExists(cmdPath) Then
  WScript.Quit 1
End If

command = """" & cmdPath & """"
exitCode = shell.Run(command, 0, True)
WScript.Quit exitCode
