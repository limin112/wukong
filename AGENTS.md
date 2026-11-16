# AGENTS.md — 火焰山 · 牛魔（wukong）

给接手的 agent 看的上手说明。先读这一页，需要细节再去 `docs/`。用户用中文交流，所有回复和游戏内文字都用中文。

## 这是什么

一个浏览器里的魂系 Boss 战：孙悟空（玩家，1.5 米）对决盘坐在火山口里的白牛魔王（坐着约 15 米，站起约 40 米）。坐姿只是序幕：开场过场以他一棍砸下、悟空在子弹时间里翻出去收尾，敲他几下他就站起来、一棍把悟空扫飞；悟空以「法相天地」变到约 30 米（比 40 米的牛魔王小一圈），主战场是两个巨人的对决。题材取自《西游记》原著（公版）。
Three.js 0.187，浏览器 ES 模块，**没有构建步骤**，改完刷新就能看到效果。

## 跑起来

```bash
npm install                 # three + puppeteer-core（测试用）
node serve.mjs 5174         # http://127.0.0.1:5174/
```

- 打开后先点一下页面（浏览器要求一次点击才能出声），然后播放开场过场，接着开战。
- 键位：WASD 移动，J 出棍，K 重击（按住蓄力），L 格挡（按准时机是弹反），空格翻滚/闪避（按住是奔跑），I 芭蕉扇（序幕里扇火；巨人对决里扇灭牛魔王的火甲和地上的熔岩火）。屏幕上会提示现在该做什么、他这一招该用哪个键应对。
- 常用参数：
  - `?skipmv` 跳过开场，直接开打；
  - `?demo` 电脑自己打（可以和 `&skipmv` 一起用）；
  - `?god` 无敌；
  - `?debug` 调试信息，`window.__niumo` 是全部游戏状态。

## 目录

```
index.html              页面、HUD 的 DOM、import map
src/niumo/main.js       启动、后处理、状态机（splash → mv → fight 序幕 → transition 山崩与法相天地 → fight 巨人对决 → ending）、屏幕提示（coach）
src/niumo/bull.js       牛魔王：AI、招式调度、弱点（双手背、双膝）、处决、材质（白牛 + 金面具着色器）
src/niumo/moves_bull.js 牛魔王的关键帧姿势（坐姿 SEAT、站姿 STAND、各招式）
src/niumo/monkey.js     悟空：控制器、外观、金箍棒（createStaff）、法相天地（setGiant）
src/niumo/moves_monkey.js  悟空的招式关键帧
src/niumo/input.js · camera.js   键位；AutoCam（自动框住悟空和牛魔王正在出招的部位；巨人对决时是魂系锁定镜头 updateDuel）
src/niumo/mv.js · cutscenes.js   开场过场「一棒问山」；山崩、结局、配音台词、过场用的角色动作（CINE_MOVES）
src/niumo/demo.js       ?demo 的演示玩家（只通过模拟输入操作）
src/niumo/arena*        火山口场景（地形、熔岩、HDR 黄昏天空与太阳主光、烟柱、道具、粒子）
src/*.js                通用引擎（Actor、姿势 IK、材质预设、特效、碰撞、相机、UI、加载器）
src/audio*              程序合成的音乐和音效（niumo_* 是本作的）
assets/                 模型（Tripo 生成并绑好 Mixamo 骨骼）、贴图、配音
test/  tools/  docs/  concept/（定稿概念图）
tools/build_site.mjs    打包静态站点：`node tools/build_site.mjs <目录>`（源码原样 + 用到的 three.js 放进 vendor/，可放在任意子路径下）。线上地址 minlibuilds.com/wukong，站点仓库是 `~/vsproject/mypage`（推到 main 后 Cloudflare 自动发布）
tools/gen_voice.mjs     配音：通过 ZenMux 调 Gemini TTS 生成 assets/audio/voice/*.m4a（key 放在根目录 .env 的 ZENMUX_API_KEY，不进仓库）
```

## 改完必须跑

```bash
node test/niumo_smoke.mjs all        # boot, mv, fight, phase2, ending, demo，全部 PASSED，零控制台错误
node test/niumo_monkey.mjs           # 悟空 85 项
node test/audio_check.mjs --no-wav   # 动了音频才跑
```

- 测试会自己起随机端口的服务器，不要占用用户正在用的端口。
- 截图在 `test/out/`。改了画面就要自己看截图，按美术设定判断好坏，别只看测试通过。
- 看过场和画面用 `node tools/cine_shot.mjs <输出目录> <URL 参数> <步骤…>`：可以把开场跳到某一秒（`mv:22.4`）或某个节拍（`beat:strike+1.0`）、把山崩/结局跳到某一秒（`cut:9`）、摆固定机位（`cam:…`）再截图，用法见文件头。`tools/shot.mjs` 是看光照用的几组固定机位。
- 帧率要保持 60（`?debug` 左上角能看到）。

## 规矩

- **美术设定 `docs/niumo_style.md` 是最终标准**：魂系的厚重，但画面是明亮的——火烧云黄昏、HDR 天空、低角度的太阳；牛魔王戴金面具（用户给的模型），悟空戴干净抛光的金面具（2026-11-16 用户定）。
- **禁止**照搬《黑神话：悟空》的任何具体造型、UI、关卡或音乐。
- 模型的骨骼名是 Mixamo 那一套。新模型要和现有的模型同名、同骨骼，直接替换文件；和网格位置相关的数字放在 `BULL_TUNING`（bull.js）和 `MONKEY_TUNING`（monkey.js）里。
- 用户没有明确要求，不要 commit 或 push。

## 已知问题（按优先级）

1. **坐着的牛魔王，袈裟和腿的网格会被拉扯变形**（Tripo 自动蒙皮造成的），山崩过场里他撑地起身时最明显。
2. **巨人对决没有处决**：血打空他直接倒下。他的招是横扫、连扫、砸棍、震地火浪、冲撞、「连击后跳劈锤地」（落点留一片熔岩火），半血「现真身」后披火甲（受伤 ÷1.5，芭蕉扇或弹反破防）并加火雨；角扫、掷棍还在招式库里，只在「悟空没变大」的二阶段才会用，正常流程走不到。
3. **巨人的走路动画**是把小悟空的按比例放大的，脚下会滑。翻滚（`roll / rollB / rollL / rollR`，moves_monkey.js）是关键帧做的贴地翻滚，没有动作捕捉那么细；牛魔王冲撞时腿用的是加速的走路动画。
4. **牛魔王的配音偏慢**（一句 7 秒左右）；想换音色或语气，改 `tools/gen_voice.mjs` 里的 `SPEAKERS` 再跑。
5. **配乐和配音都没有人耳验收**：战斗配乐是 80 年代电视剧神话风（电子鼓 + 合成贝斯 + 琵琶/铜管/女声/唢呐，原创旋律，`src/audio/niumo_music.js`），只做过响度和节拍网格的自动检查；悟空的呐喊（`y1`–`y4`）和牛魔王的遗言（`e0`）是 TTS 生成的。
6. **握棍**：姿势只管手臂，手掌由 `Actor.fistOn / fistLeft / wrapHand`（actor.js，悟空和牛魔王的 Actor 都开了 `fist: true`）在每帧最后转到「指节线顺着棍子」，再把每节手指逐节绕到棍子上（指尖略收进棍身，模型手指偏长），左手离棍子够近时也会被带上去握住。改招式时不用再管 `grip` 的手型。
7. **换过模型（2026-11-16）**：
   - 牛魔王：用户给的 Tripo 模型（FBX，`hunxi/out/tripo/niumo_bull4_src`），Tripo 重新绑 Mixamo 骨、套 idle/walk/run。上传 FBX 时贴图会丢，`hunxi/tools/render/attach_texture.mjs` 把原贴图挂回去。约 1 万面，鬃毛偏块面。
   - 悟空：`concept/niumo_w_monkey8_front.png`（monkey7 的身体、干净抛光金面具），Tripo P2、Mixamo、idle/walk/run。`polishMask` 抛光面具（只到金箍，`MASK_TOP`），`keepFaceSkin` 让头上其余部分（棕红毛发）不参与「按颜色判金」。不戴面具的版本（monkey9）留在 hunxi，`BUILD_MONKEY9=1` 可打包回来。
   - 大白牛（牛魔王原形）：`concept/niumo_w_whitebull_side.png`，Tripo P2、四足绑骨、只有一个 walk 动作，`assets/models/niumo_whitebull.glb`。冲撞的奔跑段（`runAt`–`runEnd` 再加 0.5 秒刹车）他变成大白牛（`bull.syncBeast / setBeast`），走路动作加速播成奔跑。
8. **结局**：悟空全程保持巨人，站位取自最后一击时的位置，机位是按两人的连线算的；如果恰好贴着围墙结束战斗，前景可能被石柱或岩壁挡住一部分。
9. 序幕里贴身时镜头会被他的手臂和腿占满（近镜头的肢体会抖动透明化，过场特写用 `bkNearK` 关掉）。

## 历史

本作从另一个工程（hunxi，另有一个圣堂 Boss 战）拆出来。生成模型的流程（Tripo、Codex 出图）和原始素材都留在那边，这里只放最终资源。悟空现在的模型是 `concept/niumo_w_monkey8_front.png` 经 `hunxi/out/tripo/niumo_monkey8*` 生成的，牛魔王是用户给的模型（`hunxi/out/tripo/niumo_bull4*`），大白牛是 `hunxi/out/tripo/niumo_whitebull*`；打包用 `hunxi/tools/build_niumo_assets.sh`。
