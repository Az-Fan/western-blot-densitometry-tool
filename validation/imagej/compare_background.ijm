function kth(counts, k) {
    total = 0;
    for (q=0; q<counts.length; q++) {
        total += counts[q];
        if (total>k) return q;
    }
    return counts.length-1;
}

arg = getArgument();
parts = split(arg, "|");
imagePath = parts[0];
outputPath = parts[1];
setBatchMode(true);
open(imagePath);
xs = newArray(280, 350, 418, 486, 752, 822);
y = 420; w = 55; h = 100; gap = 3; bgH = 6;
csv = "lane,raw_int_den,bg_median,net_int_den\n";
for (i=0; i<xs.length; i++) {
    makeRectangle(xs[i], y, w, h);
    getRawStatistics(nPixels, mean);
    raw = nPixels * mean;
    makeRectangle(xs[i], y-gap-bgH, w, bgH);
    getHistogram(v1, c1, 65536);
    makeRectangle(xs[i], y+h+gap, w, bgH);
    getHistogram(v2, c2, 65536);
    combined = newArray(65536);
    bgN = 0;
    for (j=0; j<65536; j++) {
        combined[j] = c1[j] + c2[j];
        bgN += combined[j];
    }
    bgMedian = (kth(combined, floor((bgN-1)/2)) + kth(combined, floor(bgN/2))) / 2;
    net = raw - nPixels * bgMedian;
    if (net<0) net=0;
    csv = csv+d2s(i+1,0)+","+d2s(raw,3)+","+d2s(bgMedian,3)+","+d2s(net,3)+"\n";
}
File.saveString(csv, outputPath);
close();
setBatchMode(false);
