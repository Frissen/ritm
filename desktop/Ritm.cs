/* ============================================================
   Ритм — десктопное приложение (хост WebView2)
   Компилируется в единственный .exe: файлы приложения и загрузчик
   WebView2 встроены в сборку и распаковываются при запуске.

   Режимы:
     Ритм.exe              — основное окно приложения
     Ритм.exe --widget     — компактный виджет поверх окон
     Ритм.exe --no-shortcuts — не создавать ярлыки на рабочем столе
   ============================================================ */

using System;
using System.Drawing;
using System.IO;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.InteropServices;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Ritm
{
    internal static class Program
    {
        private const string AppHost = "ritm.local";
        private const string Version = "1.2.0";
        private const string MainTitle = "Ритм — трекер привычек";
        private const string WidgetTitle = "Ритм";

        private static string rootDir = "";
        private static string appDir = "";
        private static string dataDir = "";

        [STAThread]
        private static void Main(string[] args)
        {
            // Сборки WebView2 встроены в .exe — подгружаем их из ресурсов.
            AppDomain.CurrentDomain.AssemblyResolve += ResolveWebView2;
            Start(args);
        }

        /* Загрузка встроенных managed-сборок WebView2 по запросу CLR */
        private static Assembly ResolveWebView2(object sender, ResolveEventArgs e)
        {
            string name = new AssemblyName(e.Name).Name;
            string res;
            if (string.Equals(name, "Microsoft.Web.WebView2.Core", StringComparison.OrdinalIgnoreCase))
                res = "WV2_Core.dll";
            else if (string.Equals(name, "Microsoft.Web.WebView2.WinForms", StringComparison.OrdinalIgnoreCase))
                res = "WV2_WinForms.dll";
            else
                return null;

            using (Stream s = Assembly.GetExecutingAssembly().GetManifestResourceStream(res))
            {
                if (s == null) return null;
                byte[] buf = new byte[s.Length];
                s.Read(buf, 0, buf.Length);
                return Assembly.Load(buf);
            }
        }

        [MethodImpl(MethodImplOptions.NoInlining)]
        private static void Start(string[] args)
        {
            bool widget = Has(args, "--widget");
            bool noLinks = Has(args, "--no-shortcuts");

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
            Application.ThreadException += (s, e) => Fail(e.Exception);
            AppDomain.CurrentDomain.UnhandledException += (s, e) => Fail(e.ExceptionObject as Exception);

            rootDir = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Ritm");
            appDir = Path.Combine(rootDir, "app", Version);
            dataDir = Path.Combine(rootDir, "webview");

            try { ExtractApp(); }
            catch (Exception ex) { Fail(ex); return; }

            if (!widget && !noLinks) EnsureShortcuts();

            string mutexName = "Local\\Ritm." + (widget ? "Widget" : "App");
            bool createdNew;
            using (var mutex = new Mutex(true, mutexName, out createdNew))
            {
                if (!createdNew) return;   // уже запущено

                using (Shell shell = widget ? BuildWidget() : BuildMain())
                {
                    shell.Shown += async (s, e) => await BootAsync(shell, widget);
                    Application.Run(shell);
                }
                GC.KeepAlive(mutex);
            }
        }

        private static bool Has(string[] args, string flag)
        {
            foreach (string a in args)
                if (string.Equals(a, flag, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        /* ============================================================
           Окно
           ============================================================ */

        private sealed class Shell : Form
        {
            internal WebView2 View = null;
            internal Panel Bar = null;          // полоса-заголовок виджета
            private int barHeight;

            internal Shell()
            {
                AutoScaleMode = AutoScaleMode.None;
                Font = new Font("Segoe UI", 9f);
            }

            internal void Relayout()
            {
                if (View == null) return;
                float s = DeviceDpi / 96f;
                if (Bar != null)
                {
                    barHeight = (int)Math.Round(34 * s);
                    Bar.Bounds = new Rectangle(0, 0, ClientSize.Width, barHeight);
                    View.Bounds = new Rectangle(
                        0, barHeight, ClientSize.Width, Math.Max(0, ClientSize.Height - barHeight));
                }
                else
                {
                    View.Bounds = new Rectangle(0, 0, ClientSize.Width, ClientSize.Height);
                }
            }

            protected override void OnResize(EventArgs e)
            {
                base.OnResize(e);
                Relayout();
            }

            protected override void OnDpiChanged(DpiChangedEventArgs e)
            {
                base.OnDpiChanged(e);
                Relayout();
            }
        }

        private static Shell BuildMain()
        {
            var shell = new Shell
            {
                Text = MainTitle,
                StartPosition = FormStartPosition.CenterScreen,
                MinimumSize = new Size(720, 560),
                BackColor = Color.FromArgb(244, 240, 232)
            };
            ApplyIcon(shell);
            float s = shell.DeviceDpi / 96f;
            int w = (int)Math.Round(1180 * s);
            int h = (int)Math.Round(820 * s);
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            shell.ClientSize = new Size(Math.Min(w, wa.Width - 40), Math.Min(h, wa.Height - 40));

            shell.View = new WebView2 { BackColor = Color.FromArgb(244, 240, 232) };
            shell.Controls.Add(shell.View);
            shell.Relayout();
            return shell;
        }

        private static Shell BuildWidget()
        {
            var accent = Color.FromArgb(240, 81, 42);
            var shell = new Shell
            {
                Text = WidgetTitle,
                FormBorderStyle = FormBorderStyle.None,
                ShowInTaskbar = true,
                TopMost = true,
                StartPosition = FormStartPosition.Manual,
                BackColor = accent
            };
            ApplyIcon(shell);
            float s = shell.DeviceDpi / 96f;
            shell.ClientSize = new Size((int)Math.Round(344 * s), (int)Math.Round(462 * s));

            var bar = new Panel { BackColor = accent, Height = (int)Math.Round(34 * s) };
            var title = new Label
            {
                Text = "РИТМ",
                ForeColor = Color.White,
                BackColor = Color.Transparent,
                AutoSize = true,
                Font = new Font("Segoe UI", 8.5f, FontStyle.Bold),
                Location = new Point((int)Math.Round(13 * s), (int)Math.Round(9 * s))
            };

            Button close = BarButton("✕");
            close.Size = new Size((int)Math.Round(38 * s), (int)Math.Round(34 * s));
            close.Location = new Point(shell.ClientSize.Width - close.Width, 0);
            close.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            close.Click += (a, b) => shell.Close();

            Button min = BarButton("–");
            min.Size = close.Size;
            min.Location = new Point(close.Left - min.Width, 0);
            min.Anchor = AnchorStyles.Top | AnchorStyles.Right;
            min.Click += (a, b) => shell.WindowState = FormWindowState.Minimized;

            EventHandler openMain = (a, b) => LaunchMain();
            bar.DoubleClick += openMain;
            title.DoubleClick += openMain;

            // Перетаскивание окна за полосу-заголовок
            MouseEventHandler drag = (a, b) =>
            {
                if (b.Button == MouseButtons.Left) StartDrag(shell);
            };
            bar.MouseDown += drag;
            title.MouseDown += drag;

            bar.Controls.Add(title);
            bar.Controls.Add(min);
            bar.Controls.Add(close);

            shell.View = new WebView2 { BackColor = Color.FromArgb(244, 240, 232) };
            shell.Bar = bar;
            shell.Controls.Add(shell.View);
            shell.Controls.Add(bar);
            shell.Relayout();
            PlaceWidget(shell);
            return shell;
        }

        private static Button BarButton(string text)
        {
            var b = new Button
            {
                Text = text,
                FlatStyle = FlatStyle.Flat,
                ForeColor = Color.White,
                BackColor = Color.FromArgb(240, 81, 42),
                Font = new Font("Segoe UI", 10f),
                TabStop = false,
                Cursor = Cursors.Hand
            };
            b.FlatAppearance.BorderSize = 0;
            b.FlatAppearance.MouseOverBackColor = Color.FromArgb(207, 66, 30);
            b.FlatAppearance.MouseDownBackColor = Color.FromArgb(178, 54, 22);
            return b;
        }

        private static void PlaceWidget(Shell shell)
        {
            Rectangle wa = Screen.PrimaryScreen.WorkingArea;
            shell.Location = new Point(
                wa.Right - shell.Width - 24,
                wa.Bottom - shell.Height - 24);
        }

        private static void StartDrag(Form form)
        {
            ReleaseCapture();
            SendMessage(form.Handle, WM_NCLBUTTONDOWN, (IntPtr)HTCAPTION, IntPtr.Zero);
        }

        private static void ApplyIcon(Form form)
        {
            try { form.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); }
            catch { }
        }

        /* ============================================================
           Запуск WebView2
           ============================================================ */

        private static async Task BootAsync(Shell shell, bool widget)
        {
            try
            {
                string loader = ExtractLoader();
                if (loader != null) CoreWebView2Environment.SetLoaderDllFolderPath(loader);

                Directory.CreateDirectory(dataDir);
                CoreWebView2Environment env = await CoreWebView2Environment.CreateAsync(null, dataDir, null);
                await shell.View.EnsureCoreWebView2Async(env);

                CoreWebView2 core = shell.View.CoreWebView2;
                core.SetVirtualHostNameToFolderMapping(
                    AppHost, appDir, CoreWebView2HostResourceAccessKind.Allow);

                core.Settings.AreDevToolsEnabled = false;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreDefaultContextMenusEnabled = !widget;
                core.Settings.IsZoomControlEnabled = !widget;
                core.Settings.AreBrowserAcceleratorKeysEnabled = !widget;

                core.PermissionRequested += (s, e) =>
                {
                    if (e.PermissionKind == CoreWebView2PermissionKind.Notifications ||
                        e.PermissionKind == CoreWebView2PermissionKind.ClipboardRead)
                        e.State = CoreWebView2PermissionState.Allow;
                };

                core.WebMessageReceived += (s, e) =>
                {
                    string msg = null;
                    try { msg = e.TryGetWebMessageAsString(); } catch { }
                    if (msg == "open-app") LaunchMain();
                };

                core.Navigate("https://" + AppHost + "/" + (widget ? "widget.html" : "index.html"));
            }
            catch (Exception ex)
            {
                Fail(ex);
            }
        }

        private static void LaunchMain()
        {
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = Application.ExecutablePath,
                    UseShellExecute = true
                });
            }
            catch { }
        }

        /* ============================================================
           Распаковка встроенных файлов
           ============================================================ */

        private static void ExtractApp()
        {
            Assembly asm = Assembly.GetExecutingAssembly();
            Directory.CreateDirectory(appDir);
            foreach (string res in asm.GetManifestResourceNames())
            {
                if (!res.StartsWith("APP_", StringComparison.Ordinal)) continue;
                string rel = res.Substring(4).Replace("__", "/");
                string target = Path.Combine(appDir, rel.Replace('/', Path.DirectorySeparatorChar));
                string dir = Path.GetDirectoryName(target);
                if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);

                using (Stream src = asm.GetManifestResourceStream(res))
                {
                    if (src == null) continue;
                    if (File.Exists(target) && new FileInfo(target).Length == src.Length) continue;
                    try
                    {
                        using (FileStream dst = File.Create(target))
                            src.CopyTo(dst);
                    }
                    catch (IOException)
                    {
                        // файл занят другим окном приложения — содержимое то же
                    }
                }
            }
        }

        private static string ExtractLoader()
        {
            string dir = Path.Combine(rootDir, "native");
            Directory.CreateDirectory(dir);
            string target = Path.Combine(dir, "WebView2Loader.dll");

            string arch;
            switch (RuntimeInformation.ProcessArchitecture)
            {
                case Architecture.X86: arch = "x86"; break;
                case Architecture.Arm64: arch = "arm64"; break;
                default: arch = "x64"; break;
            }

            Assembly asm = Assembly.GetExecutingAssembly();
            using (Stream src = asm.GetManifestResourceStream("LOADER_" + arch + ".dll"))
            {
                if (src == null) return Directory.Exists(dir) ? dir : null;
                try
                {
                    bool same = File.Exists(target) && new FileInfo(target).Length == src.Length;
                    if (!same)
                    {
                        using (FileStream dst = File.Create(target))
                            src.CopyTo(dst);
                    }
                }
                catch (IOException)
                {
                    if (!File.Exists(target)) return null;
                }
            }
            return dir;
        }

        /* ============================================================
           Ярлыки на рабочем столе
           ============================================================ */

        private static void EnsureShortcuts()
        {
            string marker = Path.Combine(rootDir, ".links-created");
            if (File.Exists(marker)) return;
            try
            {
                string exe = Application.ExecutablePath;
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string programs = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.Programs), "Ритм");

                Directory.CreateDirectory(programs);
                MakeLink(Path.Combine(desktop, "Ритм.lnk"), exe, "", MainTitle);
                MakeLink(Path.Combine(desktop, "Ритм — виджет.lnk"), exe, "--widget", "Виджет привычек поверх окон");
                MakeLink(Path.Combine(programs, "Ритм.lnk"), exe, "", MainTitle);
                MakeLink(Path.Combine(programs, "Ритм — виджет.lnk"), exe, "--widget", "Виджет привычек поверх окон");

                File.WriteAllText(marker, DateTime.Now.ToString("s"));
            }
            catch { }
        }

        private static void MakeLink(string linkPath, string target, string arguments, string description)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType == null) return;

            object shell = Activator.CreateInstance(shellType);
            try
            {
                object link = shellType.InvokeMember(
                    "CreateShortcut", BindingFlags.InvokeMethod, null, shell, new object[] { linkPath });
                Type lt = link.GetType();
                lt.InvokeMember("TargetPath", BindingFlags.SetProperty, null, link, new object[] { target });
                lt.InvokeMember("Arguments", BindingFlags.SetProperty, null, link, new object[] { arguments });
                lt.InvokeMember("Description", BindingFlags.SetProperty, null, link, new object[] { description });
                lt.InvokeMember("WorkingDirectory", BindingFlags.SetProperty, null, link,
                    new object[] { Path.GetDirectoryName(target) });
                lt.InvokeMember("IconLocation", BindingFlags.SetProperty, null, link,
                    new object[] { target + ",0" });
                lt.InvokeMember("Save", BindingFlags.InvokeMethod, null, link, null);
                Marshal.FinalReleaseComObject(link);
            }
            finally
            {
                Marshal.FinalReleaseComObject(shell);
            }
        }

        /* ============================================================
           Системные вызовы и обработка ошибок
           ============================================================ */

        private const int WM_NCLBUTTONDOWN = 0xA1;
        private const int HTCAPTION = 0x2;

        [DllImport("user32.dll")]
        private static extern bool ReleaseCapture();

        [DllImport("user32.dll", CharSet = CharSet.Auto)]
        private static extern IntPtr SendMessage(IntPtr hWnd, int msg, IntPtr wParam, IntPtr lParam);

        private static void Fail(Exception ex)
        {
            try
            {
                string log = Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "Ritm", "error.log");
                Directory.CreateDirectory(Path.GetDirectoryName(log));
                File.AppendAllText(log,
                    DateTime.Now.ToString("s") + "  " + (ex == null ? "(null)" : ex.ToString()) + "\r\n");
            }
            catch { }

            MessageBox.Show(
                "Не удалось запустить приложение «Ритм».\r\n\r\n" + (ex == null ? "Неизвестная ошибка." : ex.Message),
                "Ритм", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
