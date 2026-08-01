' AniBox 静默启动器 — 双击运行，无命令框
' 调试时仍可直接运行 AniBox.bat 查看控制台输出

Set fso = CreateObject("Scripting.FileSystemObject")
dir = fso.GetParentFolderName(WScript.ScriptFullName)

Set ws = CreateObject("Wscript.Shell")
ws.CurrentDirectory = dir

ws.Run "cmd /c """ & dir & "\AniBox.bat""", 0, False
