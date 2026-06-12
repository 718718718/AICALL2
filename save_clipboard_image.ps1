# C#コードでクリップボード画像を取得
Add-Type -TypeDefinition @"
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.IO;
using System.Windows.Forms;

public class ClipboardHelper {
    public static string SaveClipboardImage() {
        if (Clipboard.ContainsImage()) {
            Image image = Clipboard.GetImage();
            string folder = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Pictures", "ClipboardImages");
            if (!Directory.Exists(folder)) {
                Directory.CreateDirectory(folder);
            }
            string timestamp = DateTime.Now.ToString("yyyyMMdd_HHmmss");
            string filepath = Path.Combine(folder, "clip_" + timestamp + ".png");
            image.Save(filepath, ImageFormat.Png);
            Clipboard.SetText(filepath);
            return filepath;
        }
        return null;
    }
}
"@ -ReferencedAssemblies System.Drawing, System.Windows.Forms

$result = [ClipboardHelper]::SaveClipboardImage()
if ($result) {
    Write-Host "画像を保存しました: $result"
} else {
    Write-Host "クリップボードに画像がありません"
}