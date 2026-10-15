using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Windows.Forms;

namespace MeocoxFlow.Picker
{
    class Program
    {
        [DllImport("user32.dll")]
        private static extern IntPtr GetForegroundWindow();

        [DllImport("shell32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern int SHCreateItemFromParsingName(
            [MarshalAs(UnmanagedType.LPWStr)] string pszPath,
            IntPtr pbc,
            [In, MarshalAs(UnmanagedType.LPStruct)] Guid riid,
            [Out, MarshalAs(UnmanagedType.Interface)] out object ppv);

        private class WindowWrapper : IWin32Window
        {
            private readonly IntPtr _hwnd;
            public WindowWrapper(IntPtr hwnd) { _hwnd = hwnd; }
            public IntPtr Handle { get { return _hwnd; } }
        }

        [STAThread]
        static int Main(string[] args)
        {
            try
            {
                Console.OutputEncoding = new UTF8Encoding(false);
            }
            catch { }

            string title = args.Length > 0 && !string.IsNullOrEmpty(args[0]) ? args[0] : "请选择文件夹";
            string initialFolder = args.Length > 1 && !string.IsNullOrEmpty(args[1]) ? args[1] : "";

            const int ERROR_CANCELLED = unchecked((int)0x800704C7);
            IntPtr owner = GetForegroundWindow();

            // 1. 尝试使用现代 Vista+ 资源管理器标准对话框 (IFileOpenDialog)
            try
            {
                var dialog = (IFileOpenDialog)new FileOpenDialogRCW();
                try
                {
                    dialog.SetOptions(FOS.FOS_PICKFOLDERS | FOS.FOS_FORCEFILESYSTEM | FOS.FOS_NOVALIDATE | FOS.FOS_DONTADDTORECENT);
                    if (!string.IsNullOrEmpty(title))
                    {
                        dialog.SetTitle(title);
                    }
                    if (!string.IsNullOrEmpty(initialFolder) && Directory.Exists(initialFolder))
                    {
                        Guid riid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
                        object item;
                        if (SHCreateItemFromParsingName(initialFolder, IntPtr.Zero, riid, out item) == 0)
                        {
                            dialog.SetFolder((IShellItem)item);
                        }
                    }

                    int hr = dialog.Show(owner);
                    if (hr == 0)
                    {
                        IShellItem result;
                        dialog.GetResult(out result);
                        string path;
                        result.GetDisplayName(SIGDN.SIGDN_FILESYSPATH, out path);
                        if (!string.IsNullOrEmpty(path))
                        {
                            Console.WriteLine(path);
                            Console.Out.Flush();
                            return 0;
                        }
                    }
                    else if (hr == ERROR_CANCELLED)
                    {
                        return 2; // 用户在现代弹窗中点击了取消或 X
                    }
                }
                finally
                {
                    if (dialog != null)
                    {
                        Marshal.ReleaseComObject(dialog);
                    }
                }
            }
            catch
            {
                // COM 现代弹窗失败，自动向下穿透走 WinForms 兜底
            }

            // 2. WinForms FolderBrowserDialog 终极兜底
            try
            {
                using (var fb = new FolderBrowserDialog())
                {
                    fb.Description = title;
                    fb.ShowNewFolderButton = true;
                    if (!string.IsNullOrEmpty(initialFolder) && Directory.Exists(initialFolder))
                    {
                        fb.SelectedPath = initialFolder;
                    }
                    IWin32Window winWrapper = owner != IntPtr.Zero ? new WindowWrapper(owner) : null;
                    DialogResult res = winWrapper != null ? fb.ShowDialog(winWrapper) : fb.ShowDialog();
                    if (res == DialogResult.OK && !string.IsNullOrEmpty(fb.SelectedPath))
                    {
                        Console.WriteLine(fb.SelectedPath);
                        Console.Out.Flush();
                        return 0;
                    }
                }
                return 2; // 用户在兜底弹窗中点击了取消
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine(ex.Message);
                return 1;
            }
        }

        [ComImport, ClassInterface(ClassInterfaceType.None), TypeLibType(TypeLibTypeFlags.FCanCreate), Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
        private class FileOpenDialogRCW { }

        [ComImport, Guid("42F85136-DB7E-439C-85F1-E4075D135FC8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
        private interface IFileOpenDialog
        {
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
        private interface IShellItem
        {
            void BindToHandler();
            void GetParent();
            void GetDisplayName(SIGDN sigdnName, [MarshalAs(UnmanagedType.LPWStr)] out string ppszName);
            void GetAttributes();
            void Compare();
        }

        [Flags]
        private enum FOS : uint
        {
            FOS_PICKFOLDERS = 0x00000020,
            FOS_FORCEFILESYSTEM = 0x00000040,
            FOS_NOVALIDATE = 0x00000100,
            FOS_DONTADDTORECENT = 0x02000000
        }

        private enum SIGDN : uint
        {
            SIGDN_FILESYSPATH = 0x80058000
        }
    }
}
