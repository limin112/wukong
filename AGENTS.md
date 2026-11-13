# AGENTS.md — 火焰山 · 牛魔（wukong）

给接手的 agent 看的上手说明。先读这一页，需要细节再去 `docs/`。用户用中文交流，所有回复和游戏内文字都用中文。

## 这是什么

一个浏览器里的魂系 Boss 战：孙悟空（玩家，1.5 米）对决盘坐在火山口里的白牛魔王（坐着约 15 米，站起约 40 米）。题材取自《西游记》原著（公版）。
Three.js 0.187，浏览器 ES 模块，**没有构建步骤**，改完刷新就能看到效果。

## 跑起来

```bash
npm install                 # three + puppeteer-core（测试用）
node serve.mjs 5174         # http://127.0.0.1:5174/
```

- 打开后先点一下页面（浏览器要求一次点击才能出声），然后播放开场过场，接着开战。
- 键位：WASD 移动，J 轻击，K 重击（按住蓄力），L 格挡（按准时机是弹反），I 芭蕉扇，空格翻滚（按住是奔跑）。
- 常用参数：
  - `?skipmv` 跳过开场，直接开打；
  - `?demo` 电脑自己打（可以和 `&skipmv` 一起用）；
  - `?god` 无敌；
  - `?debug` 调试信息，`window.__niumo` 是全部游戏状态。

## 目录

```
index.html              页面、HUD 的 DOM、import map
src/niumo/main.js       启动、后处理、状态机（splash → mv → fight → transition → fight 二阶段 → ending）
src/niumo/bull.js       牛魔王：AI、招式调度、弱点（双手背、双膝）、处决、材质（白牛 + 金面具着色器）
src/niumo/moves_bull.js 牛魔王的关键帧姿势（坐姿 SEAT、站姿 STAND、各招式）
src/niumo/monkey.js     悟空：控制器、外观、金箍棒（createStaff）
src/niumo/moves_monkey.js  悟空的招式关键帧
src/niumo/input.js · camera.js   键位；AutoCam（自动框住悟空和牛魔王正在出招的部位）
src/niumo/mv.js · cutscenes.js   开场过场；山崩、结局、配音台词
src/niumo/demo.js       ?demo 的演示玩家（只通过模拟输入操作）
src/niumo/arena*        火山口场景（地形、熔岩、天空、烟柱、道具、粒子）
src/*.js                通用引擎（Actor、姿势 IK、材质预设、特效、碰撞、相机、UI、加载器）
src/audio*              程序合成的音乐和音效（niumo_* 是本作的）
assets/                 模型（Tripo 生成并绑好 Mixamo 骨骼）、贴图、配音
test/  tools/  docs/  concept/（定稿概念图）
```

## 改完必须跑

```bash
node test/niumo_smoke.mjs all        # boot, mv, fight, phase2, ending, demo，全部 PASSED，零控制台错误
node test/niumo_monkey.mjs           # 悟空 85 项
node test/audio_check.mjs --no-wav   # 动了音频才跑
```

- 测试会自己起随机端口的服务器，不要占用用户正在用的端口。
- 截图在 `test/out/`。改了画面就要自己看截图，按美术设定判断好坏，别只看测试通过。
- 帧率要保持 60（`?debug` 左上角能看到）。

## 规矩

- **美术设定 `docs/niumo_style.md` 是最终标准**：暗黑魂系，低调的光，画面整体偏暗；亮金只用在牛魔王的面具、棍子和护腕上。
- **禁止**照搬《黑神话：悟空》的任何具体造型、UI、关卡或音乐。
- 模型的骨骼名是 Mixamo 那一套。新模型要和现有的模型同名、同骨骼，直接替换文件；和网格位置相关的数字放在 `BULL_TUNING`（bull.js）和 `MONKEY_TUNING`（monkey.js）里。
- 用户没有明确要求，不要 commit 或 push。

## 已知问题（按优先级）

1. **二阶段打不动他。** 新白牛站起来后，小腿上弱点的位置没对准，演示玩家在二阶段 40 多秒没打掉一点血。相关代码在 `bull.js` 的 `this.knee[...]`（a2/b2，即站姿的弱点）和 `hurtZones()`。
2. **「牵牛鼻子」处决时，悟空会被夹在牛身下面。** 新模型低头时，鼻环落在胸口下方。要改 `moves_bull.js` 的低头姿势和 `bull.js` 里的 `noseRing()` / `critAnchor()`。
3. **贴身时镜头会被他的手臂和腿占满。** 手和膝盖上的熔岩裂纹弱点（`BK_EMIT` 着色器）也偏大、偏亮，看起来像贴上去的。
4. **悟空的尾巴从背部偏上的地方伸出来**，绑骨后动起来不自然。
5. **坐着的牛魔王，袈裟和腿的网格会被拉扯变形**（Tripo 自动蒙皮造成的）。

## 历史

本作从另一个工程（hunxi，另有一个圣堂 Boss 战）拆出来。生成模型的流程（Tripo、Codex 出图）和原始素材都留在那边，这里只放最终资源。
