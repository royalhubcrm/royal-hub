' Roda a ponte sem abrir janela preta na tela.
Set sh = CreateObject("WScript.Shell")
pasta = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = pasta
sh.Run """" & pasta & "\ponte-sempre.bat""", 0, False
