Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
WshShell.Run "cmd /c npm run dev", 0, False
WScript.Sleep 3000
WshShell.Run "http://localhost:3000", 0, False
