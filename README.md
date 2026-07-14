# Western Blot Densitometry Tool

一个完全在本地运行的 Western blot densitometry、band quantification 与论文组图工具。支持原始 TIFF 像素读取、手动等间距 Lane ROI、局部背景扣除、内参归一化、整膜结果表和可交互 Panel Studio。

Local-first Western blot band densitometry and publication panel editor for TIFF images. No image upload or cloud processing is required.

## 主要功能

- 读取 TIFF、PNG、JPEG；本地精确模式保留 TIFF 原始位深。
- 手工绘制第一个 Lane，复制第二个 Lane 后按间距生成整排 ROI，空泳道也会保留。
- 使用 ROI 上下等宽区域的背景中位数计算 `NetIntDen`。
- 画基准线并一键拉平倾斜膜图。
- 按“蛋白 × 样本”汇总整张膜的定量结果并导出 CSV。
- Panel Studio 支持裁剪、框线、文字、字体、字号、拖动、缩放、对齐、图层和撤销/重做。
- 导出高清 PNG 和单页 PDF；工程可保存为 JSON。
- 图片只在本机内存处理，不上传网络。

## Windows 快速启动

1. 安装 Python 3.11 或更高版本，并勾选 `Add Python to PATH`。
2. 安装依赖：

   ```powershell
   python -m pip install -r requirements.txt
   ```

3. 双击 `Start-WB-Tool.cmd`，或运行：

   ```powershell
   python server.py
   ```

4. 浏览器打开 <http://127.0.0.1:18765/>。

不要直接双击 `index.html` 做正式 TIFF 定量；该方式只能使用浏览器预览像素。

## 推荐分析流程

1. 拖入未调整亮度/对比度的原始 TIFF。
2. 如图像倾斜，点击“画线拉平”，沿同一排条带中心拖一条长基准线。
3. 手工拖出第一个 Lane ROI，复制并移动到第二个相邻 Lane。
4. 输入 Lane 数并按间距生成，逐个检查 ROI。
5. 对目标蛋白和内参分别完成框选，将结果加入整膜表。
6. 将当前裁剪加入 Panel Studio，在命名弹窗中设置蛋白名、字体和字号。
7. 调整图层并导出 PNG 或 PDF。

## 定量方法

深色条带转换为信号强度：

```text
signal = max_pixel_value - gray_value
```

局部背景取 ROI 正上方和正下方等宽区域全部信号像素的中位数：

```text
NetIntDen = sum(ROI signal) - ROI area × local background median
```

负值截断为 0。目标/内参为两者 `NetIntDen` 的比值。

## 准确性验证

`validation/` 中包含可复用的 ImageJ 对照脚本和宏。真实验证图像、ImageJ 二进制文件以及生成的测量 CSV 默认不进入 Git，避免公开实验数据。

旋转拉平使用双线性插值，可能带来极小的像素数值变化。能在采集阶段保持膜图水平时，应优先不旋转。

## 项目结构

```text
wb-gray-tool/
├─ server.py                 本地原始像素后端
├─ index.html                主页面
├─ app.js                    导入、ROI 与定量逻辑
├─ matrix.js                 整膜结果表
├─ studio.js                 Panel Studio
├─ *.css                     页面与模块样式
├─ vendor/                   浏览器端离线依赖
├─ validation/               ImageJ 对照验证材料
├─ requirements.txt          Python 依赖
├─ Start-WB-Tool.cmd         Windows 启动脚本
└─ 给使用者的说明.txt          简明使用说明
```

## 使用边界

该工具用于辅助像素定量和排版，不替代对曝光线性范围、信号饱和、实验设计和原始膜图的人工审核。正式发表前建议使用标准样图再次与 Fiji/ImageJ 交叉验证。
