# 《火焰山 · 牛魔》架构契约

总导演定稿。所有模块按这里的接口和文件归属来写。玩法见 `docs/niumo_design.md`，美术见 `docs/niumo_style.md`。

独立仓库，入口是 `index.html`。浏览器 ES 模块，无构建，Three.js 0.187（import map 指向 `node_modules/three`）。坐标：米，+y 向上。

## 目录与模块

| 部分 | 文件 |
|---|---|
| 主程序 / 过场 | `index.html`、`src/niumo/main.js`、`ui.js`、`mv.js`（开场）、`cutscenes.js`（山崩、结局、配音）、`demo.js`（演示玩家） |
| 牛魔王 | `src/niumo/bull.js`（AI、招式调度、弱点、材质）、`moves_bull.js`（关键帧姿势） |
| 悟空 | `src/niumo/monkey.js`（控制器、外观）、`moves_monkey.js`、`input.js`（键位）、`camera.js`（AutoCam） |
| 场景 | `src/niumo/arena.js`、`src/niumo/arena/*` |
| 音频 | `src/audio.js`、`src/audio/*`（`niumo_*` 是本作的音乐和音效，其余是从原工程带来的通用合成器和旧场景曲目） |
| 通用引擎 | `src/{actor,pose,look,fx,combat,camera,input,ui,assets}.js`、`src/arena/{textures,util}.js` |
| 资源 | `assets/models/niumo_{bull,monkey,staff}.glb`、`assets/textures/*niumo*`、`assets/audio/voice/` |
| 测试 / 工具 | `test/`、`tools/record_demo.mjs`、`tools/gen_voice.sh`、`tools/contact_sheet.mjs` |

通用引擎原本和另一个游戏共用，这里是独立拷贝，可以按需要修改。

## 可复用的引擎

- `src/assets.js`：`loadGLTF(url)`、`loadCharacter(url, {height, inPlace, cleanArms})` 返回 `{root, pivot, model, mesh, skeleton, bones, clips, height, scale}`（Tripo 模型朝 +X，已在加载时转正、身高归一）、`loadBlade(url, {length, gripFrac})`、`loadTexture(url, {srgb, repeat})`。
- `src/actor.js`：`new Actor(char, {lib, hold, sword, scene})`，`playBase(name, {fade, timeScale})`、`startMove(name, {speed})`、`stopMove()`、`update(dt)`、`jolt(dir, bend, shiver)`、`bonePos(name, out)`、`rig`（`R/U/F` 角色坐标轴）、`bladeBase/bladeTip/prevBase/prevTip`。
- `src/pose.js` 的招式格式（见 `moves_bull.js`、`moves_monkey.js`）：招式是关键帧姿势（`k(t, {armR:{at,pole}, armL, legL, legR, blade, spine, head, hips, pivot})`，向量为角色空间 `[右, 上, 前]`，手臂目标以肩为原点、以臂长为单位）。新招式照这个格式写在各自的 moves 文件里。
- `src/look.js`：`applyLook(root, preset)`、`updateLooks(camera)`。要新预设就在自己的模块里调用前先往 `LOOK_PRESETS` 加一项（运行时追加，不改 look.js）。
- `src/fx.js`：`new FX(scene, {arena})`，`light`、`hitSpark`、`bloodHit`、`splash`、`dust`、`motes`、`glint`、`shockwave`、`warnRing`、`pillar`、`flashMesh`、`trail(opts)`、`update(dt)`。
- `src/combat.js`：`sweepBlade(prevBase, prevTip, base, tip, capsules, radius)`、`horizDist`、`angleTo`、`separate`、`clampToArena`。
- `src/camera.js`：`CameraRig`（`addTrauma`、`punch`、`zoomPunch`、碰撞 `blockers/bodies`）。
- `src/ui.js`：`UI`（血条、体力、boss 条、标题卡、字幕、提示）。`index.html` 提供它用到的 DOM。
- `src/audio.js`：`AudioSystem`（`unlock`、`setMusic`、`play`、`setListener`、`duck`、`setMuffle`、`setVolumes`、`update`）。

## 1. 场景 `src/niumo/arena.js`

```js
export async function createVolcanoArena({ scene, renderer, quality = 'high' }) -> {
  bounds: { minX, maxX, minZ, maxZ },      // 可走区域
  playerSpawn: { x, z, yaw },              // 约 z = +40，面向 -z
  bullSeat: { x, z, yaw },                 // 约 z = -30，牛魔王盘坐的位置，面向 +z
  groundY(x, z),                           // 可走地面高度（大部分为 0）
  lavaAt(x, z),                            // 0..1，熔岩危险程度（>0.5 会伤人）
  colliders: [{ x, z, r }],                // 石碑、石柱等圆形碰撞体
  cameraBlockers: { circles: [{ x, z, r }], bounds },
  update(dt, time, camera),
  setPhase(p),                             // 0 进场 1 一阶段 2 山崩喷发 3 结局下雨
  eruption(x, z, strength),                // 局部喷发特效（熔岩溅射、亮光）
  shake(k),                                // 场景层面的震动（落石、灰尘）
  gradeHints,                              // 当前阶段给主程序的调色建议 { exposure, warm, fog }
  group,
}
```

规模：牛魔王盘坐身高约 22 米，站起约 40 米；战场以他身前为中心，半径约 40 米可走。按美术圣经做：暗色结壳的熔岩河、玄武岩、断碑、牌坊、骸骨与兵器、飘落的火灰、热浪扭曲、远山与暗红的天。

## 2. 牛魔王 `src/niumo/bull.js`

```js
export class BullKing {
  constructor({ char, scene, fx, audio, arena, cam, staff })
  pos, yaw, hp, maxHp, phase /* 1 盘坐 2 站起 */, dead, state, events /* [{type, ...}] */
  update(dt, player)
  hurtZones()      // [{ part: 'handL'|'handR'|'kneeL'|'kneeR'|'head'|'body', a: Vector3, b: Vector3, r }]
  lockTargets()    // [{ part, pos: Vector3 }]，给镜头和自动锁定
  takeHit({ dmg, poise, point, dir, heavy, from, part })
  criticalOpen(player)                 // 低头可处决时为 true
  takeCritical({ dmg, from })
}
```

- 招式与弱点按 `docs/niumo_design.md`：一阶段盘坐（横扫、砸棍、拍掌、吐火、抓），二阶段站起（踏地、角扫、火雨、掷棍）。
- 每招都有清楚的预兆（光、声、地面提示）；打玩家用 `player.takeHit({ dmg, from, kind, blockable })`。
- 序幕（坐姿）：棍子打中 `preludeHits` 下就发 `phase2` 事件起身，不再有坐姿的处决。主战（站姿）的弱点是两条小腿下段到蹄子的熔岩裂口，各有血量；两处都打碎他就跪倒，`criticalOpen` 为 true，执行「牵牛鼻子」处决。站姿时蹄子由 `groundFeet()` 放平并贴在地面上。
- 事件：`damage`、`stagger`、`phase2`（开始山崩过场）、`dead`、`critical`。

## 3. 主角 `src/niumo/monkey.js` + `input.js` + `camera.js`

```js
export class NiumoInput extends Input { }     // 键位：WASD 移动，空格点按翻滚/按住奔跑，J 轻击，K 重击（按住蓄力），L 格挡（按住，准时弹反），I 芭蕉扇
export class Monkey {
  constructor({ actor, fx, audio, cam, input, arena, staff })
  pos, yaw, hp, st, mp /* 法力，芭蕉扇消耗 */, dead, state, events
  update(dt, boss)
  takeHit({ dmg, from, kind, blockable })     // 返回 true | 'block' | 'parry' | false
  reset(spawn)
}
export class AutoCam { /* 只用键盘：自动框住猴子和牛魔王正在出招的部位，大招自动拉远，碰撞场景；addTrauma/punch/zoomPunch 同 CameraRig */ }
```

猴子身高 1.5 米，武器是金箍棒（`staff` 为一个 Object3D，沿 +Y 从握把到棍头）。棍法：三段轻击、蓄力重击、格挡弹反、翻滚无敌帧；芭蕉扇是向前的扇形风：扇灭地上的火、吹回吐火、让弱点短暂失衡。

## 4. 音频

新增音乐状态：`niumo_opening`（约 50 秒一次性，与开场 MV 分镜对齐）、`niumo_phase1`（循环）、`niumo_phase2`（循环，与一阶段无缝衔接）、`niumo_ending`（雨声和拨弦）。
新增音效：`staff_swing`、`staff_hit`、`staff_hit_heavy`、`bull_roar`、`bull_stomp`、`bull_slam`、`fire_breath`、`fan_wind`、`lava_burst`、`rock_crack`、`rain`。
接口不变：`audio.setMusic(state)`、`audio.play(name, { pos, volume, pitch })`。风格见美术圣经「音乐与声音」。

## 5. 主程序 `index.html` + `src/niumo/main.js`

- 流程：splash（点击开始）→ 一整段开场过场（「一棒问山」：走来、顿棍、标题、睁眼、六句对白、长啸、他一棍砸下而悟空闪开，镜头直接落到战斗机位）→ fight 序幕（坐姿，敲 6 下）→ transition（山崩过场 + 两句对白）→ fight 主战（站姿）→ ending（下雨，「大哥……下雨了。」）；死亡 → 直接重来，不再播过场。
- 法相天地：`monkey.setGiant(size)`（1 = 1.5 米，默认 `MONKEY_TUNING.giant` = 20 倍；棍子、步幅、判定同比放大，无视地形）、`monkey.giant`、`monkey.S`；牛魔王在二阶段看到 `player.S > 1.5` 就进入对决（`bull.duel`：招式是 `DUEL_ATTACKS`——`sweep2` / `combo2` / `slam2` / `stompL|R`（`LavaWave` 的对决尺度）/ `meteor`（`Meteor` 放大 3 倍）/ `charge`（`tickCharge`）；任何部位都吃全额伤害；`bull.flinch()` 是僵直（`hit2`），`bull.stagger()` 在对决里是架势崩（`reel`，`bull.reeling`、`bull.posture` 0..1），`bull.enraged` 是暴怒；命中特效 `bfx.giantHit`）；悟空在巨人阶段锁定横移，空格是闪步（`dodgeF/B/L/R`，位移方向 `monkey.moveYaw`）；镜头走 `AutoCam.updateDuel`（绑在悟空身后、可以越过围墙、只避开脚下的地形）；架势条是 `ui.setPosture`；对决里牛魔王的髋部碰撞圈加大（`updateBodyCircles`），两个巨人不会站进彼此身体里；牛魔王的配音走 `VOICE_STYLE.bull` 的长混响加回声（`echo`：山谷里传出来的声音）；提示在 `main.js` 的 `coach()`，UI 是 `ui.setGoal / setTip / setKeys`。
- 配音：`tools/gen_voice.mjs`（ZenMux 的 `/audio/speech`，Gemini TTS；`ZENMUX_API_KEY` 放 `.env`），台词表在脚本里；游戏内只做很轻的处理（`VOICE_STYLE`）。
- 过场接口：`bull.openingSlam({ target, hold, rest })`（坐姿朝一个地面点砸棍，棍子留在地上 `rest` 秒）、`bull.wake({ opening: false })`（醒来但不自动砸这一棍）、`arena.safeSpot(x, z, maxR, 1)`（塌陷之后仍是岩石的落脚点）、`OpeningMV.seek(t)` / `seekBeat(name, after)` 和 `Scene.seek(t)`（调试用：跳到过场的某一刻）。
- 配音：`tools/gen_voice.sh` 用 macOS `say` 生成到 `assets/audio/voice/`（含 `voice.json` 时长清单）。
- 后处理：bloom、调色（读 `arena.gradeHints`）、ACES、FXAA；过场开景深。
- 调试：`window.__niumo`，参数 `?skipmv`、`?skipintro`、`?god`、`?debug`、`?autostart`、`?turbo=N`（测试用：每帧 N 步模拟）。
- 演示：`?demo`，`src/niumo/demo.js` 的演示玩家只通过输入（摇杆方向、J K L I、空格）操作猴子，读他的预兆翻滚 / 弹反 / 扇火、打弱点、牵牛鼻子；几秒后自动开始（点击可立即开始并放出声音），配 `?skipmv` 直接进战斗。录像：`node tools/record_demo.mjs`（整页含 HUD + 游戏原声，webm）。
- 模块和模型是静态加载的，缺了就是报错，没有占位替身。金箍棒是 `monkey.js` 的 `createStaff()` 程序生成的。

## 6. 测试

- `node test/niumo_smoke.mjs [boot,mv,fight,phase2,ending,demo|all]`：整局冒烟测试（无控制台错误或警告；开场过场与对白；打中弱点、他的招式能命中；二阶段；结局；演示玩家能打伤他并活下来）。
- `node test/niumo_monkey.mjs`：悟空的招式、连击、蓄力、弹反、无敌帧、芭蕉扇、处决、镜头等（85 项）。`node test/niumo_bull.mjs`：牛魔王试验台。
- `node test/audio_check.mjs --no-wav`：音乐状态、节拍网格无缝切换、各阶段强度、音效。
- 测试一律用 `startServer(0)` 起随机端口。依赖本目录 `node_modules/puppeteer-core` 和 `/Applications/Google Chrome.app`，参数 `--use-angle=metal`。
- 截图放 `test/out/`（不进 git）。
