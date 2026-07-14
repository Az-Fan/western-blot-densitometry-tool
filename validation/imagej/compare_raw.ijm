arg = getArgument();
parts = split(arg, "|");
imagePath = parts[0];
outputPath = parts[1];
setBatchMode(true);
open(imagePath);
xs = newArray(280, 350, 418, 486, 752, 822);
ys = newArray(420, 420, 420, 420, 420, 420);
ws = newArray(55, 55, 55, 55, 55, 55);
hs = newArray(100, 100, 100, 100, 100, 100);
csv = "lane,x,y,w,h,area,mean,raw_int_den,min,max,std_dev\n";
for (i=0; i<xs.length; i++) {
    makeRectangle(xs[i], ys[i], ws[i], hs[i]);
    getRawStatistics(nPixels, mean, min, max, sd);
    raw = nPixels * mean;
    csv = csv + d2s(i+1,0)+","+d2s(xs[i],0)+","+d2s(ys[i],0)+","+d2s(ws[i],0)+","+d2s(hs[i],0)+","+d2s(nPixels,0)+","+d2s(mean,9)+","+d2s(raw,3)+","+d2s(min,3)+","+d2s(max,3)+","+d2s(sd,9)+"\n";
}
File.saveString(csv, outputPath);
close();
setBatchMode(false);
