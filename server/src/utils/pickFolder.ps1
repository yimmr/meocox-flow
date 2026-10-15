param(
    [string]$Title = "请选择文件夹",
    [string]$InitialFolder = ""
)

try {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public class NativeFolderPicker {
    [DllImport("shell32.dll")]
    private static extern int SHCreateItemFromParsingName(
        [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
        IntPtr pbc,
        [In, MarshalAs(UnmanagedType.LPStruct)] Guid riid,
        [Out, MarshalAs(UnmanagedType.Interface)] out object ppv);

    public static string PickFolder(string title, string initialFolder) {
        var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
        try {
            dialog.SetOptions(FOS.FOS_PICKFOLDERS | FOS.FOS_FORCEFILESYSTEM | FOS.FOS_NOVALIDATE);
            if (!string.IsNullOrEmpty(title)) {
                dialog.SetTitle(title);
            }
            if (!string.IsNullOrEmpty(initialFolder) && System.IO.Directory.Exists(initialFolder)) {
                Guid riid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
                object item;
                if (SHCreateItemFromParsingName(initialFolder, IntPtr.Zero, riid, out item) == 0) {
                    dialog.SetFolder((IShellItem)item);
                }
            }
            int hr = dialog.Show(IntPtr.Zero);
            if (hr == 0) {
                IShellItem result;
                dialog.GetResult(out result);
                string path;
                result.GetDisplayName(SIGDN.SIGDN_FILESYSPATH, out path);
                return path;
            }
        } finally {
            Marshal.ReleaseComObject(dialog);
        }
        return null;
    }

    [ComImport, ClassInterface(ClassInterfaceType.None), TypeLibType(TypeLibTypeFlags.FCanCreate), Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
    private class FileOpenDialogRCW { }

    [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IFileOpenDialog {
        [PreserveSig] int Show(IntPtr parent);
        void SetFileTypes();
        void SetFileTypeIndex();
        void GetFileTypeIndex();
        void Advise();
        void Unadvise();
        void SetOptions(FOS fos);
        void GetOptions(out FOS fos);
        void SetDefaultFolder(IShellItem psi);
        void SetFolder(IShellItem psi);
        void GetFolder(out IShellItem ppsi);
        void GetCurrentSelection(out IShellItem ppsi);
        void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
        void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
        void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
        void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
        void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
        void GetResult(out IShellItem ppsi);
        void AddPlace();
        void SetDefaultExtension();
        void Close();
        void SetClientGuid();
        void ClearClientData();
        void SetFilter();
    }

    [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IShellItem {
        void BindToHandler();
        void GetParent();
        void GetDisplayName(SIGDN sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
        void GetAttributes();
        void Compare();
    }

    [Flags]
    private enum FOS : uint {
        FOS_PICKFOLDERS = 0x00000020,
        FOS_FORCEFILESYSTEM = 0x00000040,
        FOS_NOVALIDATE = 0x00000100
    }

    private enum SIGDN : uint {
        SIGDN_FILESYSPATH = 0x80058000
    }
}
'@
    $res = [NativeFolderPicker]::PickFolder($Title, $InitialFolder)
    if ($res) {
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        Write-Output $res
    }
} catch {
    # Fallback to classic FolderBrowserDialog if COM fails
    Add-Type -AssemblyName System.Windows.Forms
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = $Title
    $dialog.ShowNewFolderButton = $true
    if ($InitialFolder -and (Test-Path $InitialFolder)) {
        $dialog.SelectedPath = $InitialFolder
    }
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        Write-Output $dialog.SelectedPath
    }
}
