using System;
using System.Drawing;
using System.Text;

public static class Scan2
{
    public static string Run(string photoPath)
    {
        using (var photo = new Bitmap(photoPath))
        {
            int cell = 80;
            var sb = new StringBuilder();
            for (int y = 0; y < photo.Height; y += cell)
            {
                for (int x = 1100; x < photo.Width; x += cell)
                {
                    int count = 0;
                    int x2 = Math.Min(photo.Width, x + cell);
                    int y2 = Math.Min(photo.Height, y + cell);
                    for (int yy = y; yy < y2; yy += 3)
                    {
                        for (int xx = x; xx < x2; xx += 3)
                        {
                            var c = photo.GetPixel(xx, yy);
                            if (c.R > 190 && c.G > 70 && c.G < 150 && c.B < 60 && (c.R - c.G) > 50)
                            {
                                count++;
                            }
                        }
                    }
                    if (count > 8)
                    {
                        sb.Append(x).Append(",").Append(y).Append("=").Append(count).Append(" ");
                    }
                }
            }
            return sb.ToString();
        }
    }
}
