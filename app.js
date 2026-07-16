const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const canvas=$('#imageCanvas'), overlay=$('#overlayCanvas'), ctx=canvas.getContext('2d',{willReadFrequently:true}), ox=overlay.getContext('2d');
const panelCanvas=$('#panelCanvas'), px=panelCanvas.getContext('2d');
const state={image:null,fileName:'',sourceBitDepth:8,backend:false,measureToken:0,mode:'target',selected:0,groups:{target:[],reference:[]},panelItems:[],drawing:null,drag:null,resize:null,straightenMode:false,straightenLine:null,results:{target:[],reference:[]}};

if(location.protocol.startsWith('http'))fetch('/api/status').then(r=>r.json()).then(x=>{state.backend=!!x.rawBackend;state.backendVersion=x.version||'';renderBackendStatus();renderConnection()}).catch(()=>renderConnection());else renderConnection();
function renderConnection(){const pill=$('#backendPill');pill.classList.toggle('ok',state.backend);pill.classList.toggle('bad',!state.backend);pill.querySelector('span').textContent=state.backend?`原始像素后端 · ${state.backendVersion||'已连接'}`:'预览模式 · 未连接精确后端'}
const welcome=$('#welcomeModal');function openWelcome(){welcome.hidden=false}function closeWelcome(){if($('#welcomeDontShow').checked)localStorage.setItem('wb-hide-welcome','1');welcome.hidden=true}$('#helpBtn').onclick=openWelcome;$('#closeWelcome').onclick=closeWelcome;$('#welcomeStart').onclick=closeWelcome;if(localStorage.getItem('wb-hide-welcome')!=='1')openWelcome();

$('#fileInput').addEventListener('change',e=>importImageFile(e.target.files[0]));
async function importImageFile(f){if(!f)return;if(!/\.(tif|tiff|png|jpe?g)$/i.test(f.name)&&!/^image\//i.test(f.type)){alert('暂不支持该文件。请拖入 TIFF、PNG 或 JPG 图片。');return}try{if(state.backend)await loadBackendImage(f);else if(/\.tiff?$/i.test(f.name)||/tiff/i.test(f.type))await loadTiff(f);else await loadBrowserImage(f)}catch(err){console.error(err);alert('无法读取这张图片：'+(err.message||'未知解码错误'))}}
let dragDepth=0;window.addEventListener('dragenter',e=>{e.preventDefault();dragDepth++;$('#dropOverlay').classList.add('active')});window.addEventListener('dragover',e=>{e.preventDefault();if(e.dataTransfer)e.dataTransfer.dropEffect='copy'});window.addEventListener('dragleave',e=>{e.preventDefault();dragDepth=Math.max(0,dragDepth-1);if(!dragDepth)$('#dropOverlay').classList.remove('active')});window.addEventListener('drop',e=>{e.preventDefault();dragDepth=0;$('#dropOverlay').classList.remove('active');const files=[...(e.dataTransfer?.files||[])],f=files.find(x=>/\.(tif|tiff|png|jpe?g)$/i.test(x.name)||/^image\//i.test(x.type));if(f)importImageFile(f);else alert('没有找到可读取的 TIFF、PNG 或 JPG 图片。')});

function prepareImage(width,height,fileName,bitDepth=8){state.image={width,height};state.fileName=fileName;state.sourceBitDepth=bitDepth;state.groups={target:[],reference:[]};canvas.width=overlay.width=width;canvas.height=overlay.height=height;$('#emptyState').hidden=true;$('#canvasWrap').hidden=false;$('#zoomSelect').value='fit'}
function finishImage(){autoDetectSignal();applyDisplayMode();applyZoom();redraw();calculate();requestAnimationFrame(focusInitialSignal)}
function autoDetectSignal(){const d=ctx.getImageData(0,0,canvas.width,canvas.height).data,step=Math.max(4,Math.floor(d.length/20000/4)*4);let sum=0,n=0;for(let i=0;i<d.length;i+=step){sum+=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];n++}$('#signalMode').value=sum/n<127?'light':'dark'}
function applyDisplayMode(){const choice=$('#displayMode').value,autoInvert=choice==='auto'&&$('#signalMode').value==='light';state.displayInvert=choice==='invert'||autoInvert;canvas.style.filter=state.displayInvert?'invert(1)':'none'}
function loadBrowserImage(file){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{prepareImage(img.naturalWidth,img.naturalHeight,file.name,8);ctx.drawImage(img,0,0);URL.revokeObjectURL(img.src);finishImage();resolve()};img.onerror=()=>reject(new Error('浏览器无法解码该格式'));img.src=URL.createObjectURL(file)})}
async function loadTiff(file){if(typeof UTIF==='undefined')throw new Error('TIFF 解码组件未加载');const buffer=await file.arrayBuffer(),ifds=UTIF.decode(buffer);if(!ifds.length)throw new Error('TIFF 中没有可读取的图像页');const page=ifds[0];UTIF.decodeImage(buffer,page);const width=page.width||page.t256?.[0],height=page.height||page.t257?.[0],bits=page.t258||[8],bitDepth=Math.max(...bits);if(!width||!height)throw new Error('无法识别 TIFF 尺寸');const rgba=UTIF.toRGBA8(page);let lo=255,hi=0;for(let i=0;i<rgba.length;i+=Math.max(4,Math.floor(rgba.length/20000/4)*4)){lo=Math.min(lo,rgba[i]);hi=Math.max(hi,rgba[i])}if(hi-lo<2)throw new Error('浏览器未能正确解码这张 TIFF（画面会变成全黑）。请使用 WB-Densitometry 桌面版，或双击 Start-WB-Tool.cmd 后在本地精确版中导入。');prepareImage(width,height,file.name,bitDepth);ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba),width,height),0,0);finishImage()}
async function loadBackendImage(file){const res=await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Filename':encodeURIComponent(file.name)},body:file}),info=await res.json();if(!res.ok||!info.ok)throw new Error(info.error||'本地读取器上传失败');const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=info.preview+'?t='+Date.now()});prepareImage(info.width,info.height,file.name,8);state.rawBitDepth=info.bits;ctx.drawImage(img,0,0);finishImage();renderBackendStatus(info)}
function renderBackendStatus(info){const badge=$('#qcBadge');if(state.backend&&!state.image)badge.textContent='原始像素后端已连接';if(info)badge.title=`${info.dtype||''} · ${info.bits} bit · ${info.width}×${info.height}`}
$('#modePicker').addEventListener('click',e=>{if(!e.target.dataset.mode)return;state.mode=e.target.dataset.mode;$$('#modePicker button').forEach(b=>b.classList.toggle('active',b.dataset.mode===state.mode));redraw()});
['signalMode','bgGap','bgHeight'].forEach(id=>$('#'+id).addEventListener('change',calculate));
$('#displayMode').addEventListener('change',applyDisplayMode);
$('#signalMode').addEventListener('change',applyDisplayMode);
$('#panelBorder').addEventListener('change',renderPanel);
$('#panelLayout').addEventListener('change',renderPanel);
$('#undoBtn').onclick=()=>{state.groups[state.mode]=[];calculate();redraw()};
$('#clearBtn').onclick=()=>{state.groups={target:[],reference:[]};calculate();redraw()};
$('#removeImageBtn').onclick=()=>{state.image=null;state.fileName='';state.groups={target:[],reference:[]};state.results={target:[],reference:[]};canvas.width=overlay.width=0;canvas.height=overlay.height=0;$('#fileInput').value='';$('#canvasWrap').hidden=true;$('#emptyState').hidden=false;calculate()};
$('#zoomSelect').addEventListener('change',applyZoom);
function applyZoom(){if(!state.image)return;const v=$('#zoomSelect').value;let w=v==='fit'?Math.min(canvas.width,Math.max(320,$('#canvasWrap').clientWidth||900)):Math.round(canvas.width*+v),h=Math.round(w*canvas.height/canvas.width);for(const c of [canvas,overlay]){c.style.width=w+'px';c.style.height=h+'px'}}
function focusInitialSignal(){if(!state.image||!canvas.width)return;const w=canvas.width,h=canvas.height,stepX=Math.max(1,Math.floor(w/450)),stepY=Math.max(1,Math.floor(h/280)),data=ctx.getImageData(0,0,w,h).data,rows=[];for(let y=0;y<h;y+=stepY){let sum=0,sum2=0,n=0;for(let x=0;x<w;x+=stepX){const i=(y*w+x)*4,v=.2126*data[i]+.7152*data[i+1]+.0722*data[i+2];sum+=v;sum2+=v*v;n++}rows.push({y,score:Math.max(0,sum2/n-(sum/n)**2)})}const radius=Math.max(1,Math.round(rows.length*.008));let bestY=h/2,best=-1;for(let i=0;i<rows.length;i++){let score=0,n=0;for(let j=Math.max(0,i-radius);j<=Math.min(rows.length-1,i+radius);j++){score+=rows[j].score;n++}score/=n;if(score>best){best=score;bestY=rows[i].y}}const wrap=$('#canvasWrap'),displayScale=(parseFloat(canvas.style.width)||w)/w;wrap.scrollTop=Math.max(0,bestY*displayScale-wrap.clientHeight/2);wrap.scrollLeft=Math.max(0,(w*displayScale-wrap.clientWidth)/2)}
$('#focusRoiBtn').onclick=()=>{const r=state.groups[state.mode][0];if(!r){alert('请先关闭“单击放置固定框”，粗略框住整排条带。');return}const wrap=$('#canvasWrap'),scale=clamp(Math.min((wrap.clientWidth*.86)/r.w,(wrap.clientHeight*.72)/r.h),.1,16),w=Math.round(canvas.width*scale),h=Math.round(canvas.height*scale);for(const c of [canvas,overlay]){c.style.width=w+'px';c.style.height=h+'px'}$('#zoomSelect').value='';requestAnimationFrame(()=>{wrap.scrollLeft=(r.x+r.w/2)*scale-wrap.clientWidth/2;wrap.scrollTop=(r.y+r.h/2)*scale-wrap.clientHeight/2})};
$('#straightenBtn').onclick=()=>{if(!state.image){alert('请先导入图片。');return}state.straightenMode=!state.straightenMode;state.straightenLine=null;$('#straightenBtn').classList.toggle('active',state.straightenMode);$('#straightenBtn').textContent=state.straightenMode?'请沿条带拖一条线':'画线拉平';redraw()};
async function applyStraighten(line){const dx=line.end.x-line.start.x,dy=line.end.y-line.start.y;if(Math.hypot(dx,dy)<20){alert('基准线太短，请沿同一排条带画一条更长的线。');return}const radians=Math.atan2(dy,dx),degrees=radians*180/Math.PI;if(Math.abs(degrees)>30){alert('检测到倾斜超过 30°，请沿同一排条带重新画线。');return}if(Math.abs(degrees)<.05){alert('图像已经基本水平，无需校正。');return}if(state.backend){const res=await fetch('/api/rotate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({angle:degrees})}),data=await res.json();if(!res.ok||!data.ok)throw new Error(data.error||'拉平失败');const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=data.preview+'?t='+Date.now()});ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0)}else{const copy=document.createElement('canvas');copy.width=canvas.width;copy.height=canvas.height;copy.getContext('2d').drawImage(canvas,0,0);ctx.save();ctx.clearRect(0,0,canvas.width,canvas.height);ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(-radians);ctx.drawImage(copy,-copy.width/2,-copy.height/2);ctx.restore()}state.groups={target:[],reference:[]};state.results={target:[],reference:[]};applyDisplayMode();redraw();calculate();alert(`已按基准线校正 ${Math.abs(degrees).toFixed(2)}°。请重新框选 Lane。`)}
$('#detectAllBtn').onclick=()=>detectBands(null);
$('#startRegionBtn').onclick=()=>{state.groups[state.mode]=[];state.selected=0;redraw();calculate();alert('现在请用鼠标粗略框住一整排目标条带，框内不要包含其他蛋白行。框好后点击“② 识别框内条带”。')};
$('#detectRegionBtn').onclick=()=>{const r=currentRoi();if(!r){alert('请先粗略框住要搜索的条带区域。');return}detectBands(r)};
$('#startFirstLaneBtn').onclick=()=>{state.groups[state.mode]=[];state.selected=0;redraw();calculate()};
function syncRoiSize(r){if(!r)return;const w=Math.round(r.w),h=Math.round(r.h);$('#roiWidth').value=w;$('#roiHeight').value=h;$('#cropWidth').value=w;$('#cropHeight').value=h}
function setRoiSize(r,w,h){const cx=r.x+r.w/2,cy=r.y+r.h/2;r.w=clamp(w,4,canvas.width);r.h=clamp(h,4,canvas.height);r.x=clamp(cx-r.w/2,0,canvas.width-r.w);r.y=clamp(cy-r.h/2,0,canvas.height-r.h)}
function applyRoiSizeFromInputs(showWarning=false){const r=currentRoi();if(!r){if(showWarning)alert('请先框选或选中一个 ROI。');return}const w=+$('#roiWidth').value,h=+$('#roiHeight').value;if(!Number.isFinite(w)||!Number.isFinite(h)||w<4||h<4)return;setRoiSize(r,w,h);syncRoiSize(r);calculate();redraw()}
$('#applyRoiSizeBtn').onclick=()=>applyRoiSizeFromInputs(true);
for(const input of [$('#roiWidth'),$('#roiHeight')]){input.addEventListener('input',()=>applyRoiSizeFromInputs(false));input.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();applyRoiSizeFromInputs(true);input.blur()}})}
$('#applyAllRoiSizeBtn').onclick=()=>{const g=state.groups[state.mode];if(!g.length){alert('当前没有 ROI。');return}const w=+$('#roiWidth').value,h=+$('#roiHeight').value;g.forEach(r=>setRoiSize(r,w,h));calculate();redraw()};
$('#duplicateLaneBtn').onclick=()=>{const r=currentRoi();if(!r){alert('请先手工框选第1个 Lane。');return}const copy={x:clamp(r.x+r.w*1.5,0,canvas.width-r.w),y:r.y,w:r.w,h:r.h};state.groups[sta…10950 tokens truncated…cdiv class="section-title">
        <div><h2>手工拼图 Panel</h2><p>画一个框、加入一个裁剪；拖动卡片改变顺序，使用上下按钮进行对齐。</p></div>
        <button id="exportPanel" disabled>导出 Panel PNG</button>
      </div>
      <div class="panel-controls">
        <button id="addToPanel">加入 Panel</button>
        <button id="clearPanel" class="ghost danger">清空 Panel</button>
        <label>排列 <select id="panelLayout"><option value="vertical">上下排列（多张膜）</option><option value="horizontal">左右排列（单个条带）</option></select></label>
        <label><input id="panelBorder" type="checkbox" checked> 导出外框</label>
      </div>
      <div id="panelEmpty">框选条带后自动生成预览</div>
      <div id="panelEditor"></div>
      <div id="panelPreviewWrap"><canvas id="panelCanvas"></canvas></div>
      <p class="panel-note">卡片可拖动排序。上下排列时用 ←/→ 调整行对齐；左右排列时用 ↑/↓ 调整条带对齐。Shift+点击每次移动5像素。</p>
    </section>

    <section class="panel-studio card">
      <div class="section-title"><div><h2>Panel Studio</h2><p>裁剪作为图层加入画布，可自由拖动、缩放、命名和对齐。</p></div><div class="actions"><button id="studioSave" class="ghost">保存工程</button><label class="studio-file ghost">打开工程<input id="studioLoad" type="file" accept="application/json"></label><button id="studioExportPdf" class="ghost">导出 PDF</button><button id="studioExport">导出高清 PNG</button></div></div>
      <div class="studio-toolbar">
        <label>名称 <input id="studioName" placeholder="例如 p-mTOR"></label><button id="studioAddCrop">加入当前裁剪</button><button id="studioAddText" class="ghost">添加文字</button>
        <button id="studioUndo" class="ghost">撤销</button><button id="studioRedo" class="ghost">重做</button>
        <button id="studioAlignLeft" class="ghost">左对齐</button><button id="studioAlignTop" class="ghost">顶对齐</button><button id="studioDistH" class="ghost">横向等距</button><button id="studioDistV" class="ghost">纵向等距</button>
        <button id="studioFront" class="ghost">上移一层</button><button id="studioBack" class="ghost">下移一层</button><button id="studioDelete" class="ghost danger">删除</button>
        <label>亮度 <input id="studioBrightness" type="range" min="-100" max="100" value="0"><output id="studioBrightnessValue">0</output></label>
        <label>对比度 <input id="studioContrast" type="range" min="-100" max="100" value="0"><output id="studioContrastValue">0</output></label>
        <label>字体 <select id="studioFontFamily"><option>Arial</option><option>Times New Roman</option><option>Helvetica</option><option>Calibri</option></select></label>
        <label>文字字号 <input id="studioFontSize" type="number" min="8" max="96" value="24"></label>
        <button id="studioResetTone" class="ghost">重置显示</button>
      </div>
      <div class="studio-body"><div id="studioStage"></div><aside><h3>图层</h3><div id="studioLayers"></div><p>单击选择；Shift+单击多选。拖动四角缩放，方向键微调。</p></aside></div>
    </section>
  </main>
  <footer>本工具仅做像素定量，不替代对曝光线性范围、实验设计和原始膜图的人工审核。</footer>
  <script src="vendor/pako.min.js"></script>
  <script src="vendor/UTIF.js"></script>
  <script src="vendor/konva.min.js"></script>
  <script src="vendor/jspdf.umd.min.js"></script>
  <script src="app.js?v=20260715-5"></script>
  <script src="matrix.js"></script>
  <script src="studio.js"></script>
</body>
</html>
