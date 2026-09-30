' Coloca (ou tira) a ponte na pasta "Inicializar" do Windows, para subir sozinha no logon.
' Uso:  wscript criar-atalho-inicio.vbs        -> cria
'       wscript criar-atalho-inicio.vbs /tirar -> remove
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
pasta   = fso.GetParentFolderName(WScript.ScriptFullName)
atalho  = sh.SpecialFolders("Startup") & "\Royal - Ponte do WhatsApp.lnk"

If WScript.Arguments.Count > 0 And LCase(WScript.Arguments(0)) = "/tirar" Then
  If fso.FileExists(atalho) Then fso.DeleteFile atalho
Else
  Set lnk = sh.CreateShortcut(atalho)
  lnk.TargetPath       = "wscript.exe"
  lnk.Arguments        = """" & pasta & "\ponte-oculta.vbs"""
  lnk.WorkingDirectory = pasta
  lnk.Description      = "Ponte do WhatsApp do Royal CRM"
  lnk.Save
End If
