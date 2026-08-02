# F 盘番剧库分析报告

> 分析日期：2026年7月31日 | 总视频数：4,549 | 总字幕数：1,059

---

## 一、总体概览

F 盘共有 **5 个顶级目录**，其中 3 个包含番剧资源：

| 目录 | 视频文件 | 字幕文件 | 含视频的子目录数 | 说明 |
|------|---------|---------|:--:|------|
| **季度新番** | 1,843（MP4:1,184 / MKV:659） | 75 | 183 | 按季度整理，每季有独立子文件夹 |
| **收藏** | 1,922（几乎全是 MKV） | 686 | 133 | 高质量收藏（VCB/Moozzi2/DBD 等压制组） |
| **补番区** | 784（MKV 为主） | 329 | 62 | 待补/已补番剧，BD 外挂字幕居多 |
| **好看的番** | 0 | 0 | 0 | 空目录 |
| **种子备份** | 0 | 0 | 0 | 空目录 |

---

## 二、每种文件夹结构类型详解

### 类型 A — 扁平 MP4（内嵌字幕） ✅ 正常识别

季度新番最常见的结构。视频文件直接放在系列文件夹下，字幕已内嵌在视频中。

```
季度新番/23年10月新番/
  完结 已追 葬送的芙莉莲/
    [Sakurato] Sousou no Frieren [01]...[CHS].mp4   ← 28集
    [Sakurato] Sousou no Frieren [02]...[CHS].mp4
    cover.jpg

  完结 已追 药屋少女的呢喃/
    [Comicat] Kusuriya no Hitorigoto [01]...[GB&JP].mp4  ← 24集
    [Comicat] Kusuriya no Hitorigoto [02]...[GB&JP].mp4
    cover.jpg
```

**扫描器处理**：直接识别为 1 个系列，系列名 = `cleanTitle("完结 已追 葬送的芙莉莲")` = `"葬送的芙莉莲"`。

---

### 类型 B — 扁平 MKV（纯视频文件） ✅ 正常识别

收藏区常见。只有 mkv 文件，无外挂字幕。

```
收藏/Fate/
  完结 已追 Fate Zero/
    [VCB-Studio] Fate Zero [01][Ma10p_1080p][x265_flac].mkv   ← 25集
    [VCB-Studio] Fate Zero [02][Ma10p_1080p][x265_flac].mkv
    ...

  完结 已追 Fate stay night Unlimited Blade Works/
    [VCB-Studio] Fate stay night UBW [00]...[x265_flac].mkv  ← 26集
    ...
    CDs/  Scans/  SPs/    ← 非视频子目录，不创建系列
```

**扫描器处理**：正常识别。`CDs/Scans/SPs` 不含视频文件，不产生额外系列。

---

### 类型 C — 视频+外挂字幕混合 🟡 基本正常，字幕需匹配

BD 压制版最常见。同目录下 mkv + .ass/.srt 混放。

```
补番区/完结 已追 龙与魔女 第一季/
  [Nekomoe kissaten&VCB-Studio] Burn the Witch [Ma10p_1080p]/
    Burn the Witch [01]...[x265_flac_aac].mkv
    Burn the Witch [01]...[x265_flac_aac].sc.ass     ← 简体字幕
    Burn the Witch [01]...[x265_flac_aac].tc.ass     ← 繁体字幕
    Burn the Witch [02]...[x265_flac_aac].mkv
    Burn the Witch [02]...[x265_flac_aac].sc.ass
    Burn the Witch [02]...[x265_flac_aac].tc.ass
    CDs/  SPs/  Fonts.zip  cover.jpg

收藏/冰海战记/完结 已追 冰海战记 第一季/
  [UHA-WINGS][Vindland Saga][01][BDRIP x264 1080p].mkv
  [UHA-WINGS][Vindland Saga][01][BDRIP x264 1080p].sc.ass
  [UHA-WINGS][Vindland Saga][01][BDRIP x264 1080p].tc.ass
  ...（24集 × 3文件 = 72个文件）
```

**扫描器处理**：系列正常识别。字幕匹配依赖同名前缀策略（`subtitle.ts` 的策略1），`Burn the Witch [01]...mkv` 能匹配到同前缀的 `.sc.ass` 和 `.tc.ass`。

---

### 类型 D — 父级空/子级有视频的 BD 合集 🔴 **识别问题！**

父文件夹是容器角色（本身无视频），子文件夹才是真正的番剧内容。

#### 案例 1：起吹响！上低音号

```
补番区/完结 已追 吹响！上低音号/          ← 无视频文件
  完结 未追 吹响！上低音号 剧场版1/
    [VCB-Studio] Gekijouban Hibike! Euphonium.../  ← 视频在这里（3层深）
      [VCB-Studio] Gekijouban Hibike... [01].mkv + .chs.ass + .cht.ass
  完结 未追 吹响！上低音号 剧场版2/.../
  完结 未追 吹响！上低音号 剧场版3/.../
  完结 未追 吹响！上低音号 剧场版4/.../
  完结 未追 吹响！上低音号 第一季+OVA/
    [VCB-Studio] Sound! Euphonium [Hi10p_1080p]/  ← 视频在这里
  完结 未追 吹响！上低音号 第二季/
    [VCB-Studio] Hibike! Euphonium 2 [Ma10p_1080p]/
  完结 未追 莉兹与青鸟/
    [Airota&VCB-Studio] Liz to Aoi Tori [Ma10p_1080p]/
```

**扫描器会创建 7 个系列**，但名称都是 VCB 压制组的文件夹名（如 `"Gekijouban Hibike! Euphonium Kitaukou..."`），而不是中文名。用户期望的是按上层中文文件夹名分组。

#### 案例 2：狂赌之渊

```
补番区/完结 在追 狂赌之渊/              ← 无视频文件
  [Nekomoe kissaten&LoliHouse] Kakegurui Twin.../  ← S1 (6集)
  [VCB-Studio] Kakegurui [Ma10p_1080p]/            ← S2 (12集)
  [VCB-Studio] Kakegurui×× [Ma10p_1080p]/          ← S3 (12集)
```

**扫描器创建 3 个独立系列**，名称分别为压制组文件夹名。不会自动合并为 "狂赌之渊"。

#### 案例 3：石纪元

```
补番区/完结 未追 石纪元/               ← 无视频文件，3种不同命名风格
  [BeanSub&FZSD&LoliHouse] Dr.STONE S3 [...]/      ← S3
  [KTXP][Dr. Stone - Stone Wars][01~11][...]/      ← S2
  [orion origin] Dr.STONE：New World [12-22][...]/  ← S3（后半）
```

**3 个独立系列**，不同命名风格导致标题相似度可能低于 85%，不会自动合并。

#### 案例 4：命运石之门（中文编号子目录）

```
补番区/完结 未追 命运石之门/
  命运石之门/                          ← 多余的中间层
    1、命运石之门/                      ← 中文编号+中文名
    2、剧场版 负荷领域的既视感/
    3、命运石之门0/
    字体/
```

**4 层嵌套**！视频在 "1、命运石之门" 等子目录里，扫描器会将它们命名为 `"1、命运石之门"`，不够友好。

#### 案例 5：Re:从零

```
收藏/RE：从零开始的异世界生活/
  完结 已追 Re：从零开始的异世界生活 第一季 第二季/  ← 无视频
    [VCB-Studio] Re Zero... [Ma10p_1080p]/          ← S1
    [VCB-Studio] Re Zero... 2nd Season [Ma10p_1080p]/ ← S2
    [VCB-Studio] Re Zero... Memory Snow [Ma10p_1080p]/ ← OVA
    [VCB-Studio] Re Zero... Hyouketsu no Kizuna [Ma10p_1080p]/ ← OVA
    [VCB-Studio] Re Zero... Shin Henshuu-ban [Ma10p_1080p]/    ← 新编版
```

**5 个独立系列**，不合并。

---

### 类型 E — 主目录有视频 + 子目录也有视频 🔴 **产生垃圾系列！**

#### 案例 1：铃芽之旅（最严重）

```
收藏/新海诚 电影/
  [DBD-Raws][铃芽之旅]...[MKV]/
    [DBD-Raws][铃芽之旅]...[FLAC+DTS].mkv          ← 正片 1 集
    [DBD-Raws][铃芽之旅]...[FLAC+DTS].scjp.ass     ← 字幕
    [DBD-Raws][铃芽之旅]...[FLAC+DTS].tcjp.ass
    PV/          ← 有 12 个 mkv！  → **产生系列 "PV"（12集）**
    menu/        ← 有 17 个 mkv！  → **产生系列 "menu"（17集）**
    特典映像/    ← 有 10 个 mkv！  → **产生系列 "特典映像"（10集）**
    Fonts/  Scans/  ← 无视频，安全
```

**扫描器会创建 4 个系列**："铃芽之旅"（正片1集）+ "PV"（12集）+ "menu"（17集）+ "特典映像"（10集）。后面的 3 个是垃圾系列。

#### 案例 2：Fate Zero（重复内容）

```
收藏/Fate/
  完结 已追 Fate Zero/
    [VCB-Studio] Fate Zero [01]...[x265_flac].mkv   ← 主目录 25 集
    ...
    [VCB-Studio] Fate Zero [25]...[x265_flac].mkv
    [VCB-Studio] Fate Zero [Ma10p_1080p]/           ← 子目录！
      [VCB-Studio] Fate Zero [05]...mkv   ← 重复集！
      [VCB-Studio] Fate Zero [08]...mkv   ← 重复集！
      [VCB-Studio] Fate Zero [16]...mkv
      [VCB-Studio] Fate Zero [20]...mkv
      [VCB-Studio] Fate Zero [Remix02]...mkv
```

**扫描器创建 2 个系列**："Fate Zero"（25集）+ "Fate Zero [Ma10p_1080p]"（5集）。后者是重复的，会污染海报墙。相似度 > 85% 可能合并，但集数会混乱。

---

### 类型 F — 多版本并存 🔴 **识别混淆！**

#### 案例：天气之子

```
收藏/新海诚 电影/
  [DMG&VCB-Studio] Tenki no Ko/
    [DMG&VCB-Studio] Tenki no Ko [Ma10p_1080p]/     ← 1080p 版
      [DMG&VCB-Studio] Tenki no Ko [Ma10p_1080p][x265_flac].mkv
      CDs/  SPs/
    [VCB-Studio] Tenki no Ko [Ma10p_2160p_HDR]/      ← 4K HDR 版
      [VCB-Studio] Tenki no Ko [Ma10p_2160p_HDR][x265_flac].mkv
      SPs/
```

**扫描器创建 2 个系列**："Tenki no Ko [Ma10p_1080p]" 和 "Tenki no Ko [Ma10p_2160p_HDR]"。相似度合并后可能产生混淆。

---

## 三、无法正确识别的根因汇总

| # | 问题模式 | 影响范围 | 严重程度 |
|:--:|---------|---------|:--:|
| 1 | **BD 合集：父目录无视频，子目录含视频** | 吹响上低音号(7子目录)、狂赌之渊(3)、石纪元(3)、Re:0(5)、盾之勇者(3)、Fate系列、五等分 | 🔴 高 |
| 2 | **子目录含视频导致垃圾系列** | 铃芽之旅(PV/menu/特典映像 共39集垃圾)、Fate Zero(重复5集) | 🔴 高 |
| 3 | **过度嵌套**（3-4层深） | 吹响上低音号(3层)、命运石之门(4层)、魔都精兵的奴隶(5层 CDs) | 🟡 中 |
| 4 | **多版本分目录存放** | 天气之子(1080p+2160p)、新海诚电影集 | 🟡 中 |
| 5 | **非标准目录命名** | 石纪元 3 种子文件夹命名风格不同、命运石之门中文编号目录 | 🟡 低 |
| 6 | **状态标记前缀未清理** | 全部 `完结 已追`、`在播 在追` 等前缀 ✅ 已由 cleanTitle 处理 | ✅ 正常 |

---

## 四、建议修复方案

### 短期（可直接修改 scanner.ts）

1. **SPs/PV/menu/特典映像 目录跳过**：在 `walk()` 中添加子目录名过滤，排除 `SPs`、`PV`、`menu`、`特典映像`、`メニュー`、`映像特典`、`Bonus`、`Extras`、`CDs`

2. **向上回退搜索视频**：当 walk 进入深层子目录发现视频，且在 1-2 层之上的父目录没有视频时，向上回退目录名作为系列标题（用最近的"有意义"的目录名）

3. **更深层的 cleanTitle**：对每层目录名都执行 cleanTitle，而不仅仅是最底层

### 中期（调整扫描策略）

4. **智能 BD 合并**：如果一个目录下全是子目录（无直接视频文件），且子目录名相似度 >= 85%，则合并为一个系列

5. **同名系列去重**：相同 `cleanTitle` 结果 + 相同季节应该合并，不管文件夹路径

---

## 五、完整番剧清单

### 季度新番（按季度）

| 季度 | 番剧数 | 代表性番剧 |
|------|:--:|------|
| 23年4月 | 8 | 我推的孩子、鬼灭之刃刀匠村篇、天国大魔境、冰海战记S2、地狱乐 |
| 23年7月 | 10 | 咒术回战S2、BanG Dream! MyGO!!!!!、无职转生S2、僵尸百分百 |
| 23年10月 | 8 | 葬送的芙莉莲、药屋少女的呢喃、进击的巨人最终季、间谍过家家S2 |
| 24年1月 | 5 | 迷宫饭、我独自升级、Bucchigiri |
| 24年4月 | 10 | 怪兽8号、哭泣少女乐队、无职转生S2后半、鬼灭之刃柱训练篇 |
| 24年7月 | 11 | 败犬女主太多了、我推的孩子S2、小市民系列、不时轻声以俄语遮羞 |
| 24年10月 | 8 | Re:从零S3、青之箱、超自然武装当哒当、关于地球的运动 |
| 25年1月 | 11 | BanG Dream! Ave Mujica、药屋少女S2、舞冰的祈愿、我独自升级S2 |
| 25年4月 | 17 | 机动战士高达GQuuuuuuX、九龙大众浪漫、LAZARUS、凸变英雄X |
| 25年7月 | 6 | 碧蓝之海S2、光死去的夏天、Bad Girl、拔作岛 |

**季度新番小计：约 94 部番剧**（含在播/在追/已追/未追 状态标签）

### 收藏

| 系列 | 包含内容 |
|------|------|
| **Fate 系列** | Fate/Zero、UBW、HF三部曲、FGO 多部、卫宫饭、嘉年华、埃尔梅罗二世 |
| **EVA 系列** | 旧TV+旧剧场版、新剧场版 |
| **新海诚 电影** | 你的名字、天气之子、铃芽之旅、言叶之庭 |
| **宫崎骏 电影** | （目录存在） |
| **咒术回战** | S1 |
| **冰海战记** | S1、S2 |
| **我推的孩子** | S1 |
| **Re:从零** | S1+S2+OVA+新编版 |
| **五等分的新娘** | S1+S2+剧场版 |
| **夏日重现** | BD-BOX 全集 |
| **堀与宫村** | S1（含高画质版） |
| **四月是你的谎言** | 全集 |
| **小林家的龙女仆** | S1、S2 |

**收藏小计：约 35+ 部作品**（很多为 BD 压制版，画质最高）

### 补番区

| 状态 | 番剧 | 特点 |
|------|------|------|
| 在追 | 狂赌之渊 | S1+S2+双(Twin) |
| 已追 | 吹响！上低音号 | 完整系列（2季+4剧场版+莉兹与青鸟） |
| 已追 | 龙与魔女 S1 | BD 外挂字幕 |
| 未追 | 86不存在的战区 | BD 外挂字幕 |
| 未追 | Beastars | S1+S2 BD |
| 未追 | 冰菓 | BD 外挂字幕 |
| 未追 | 吊带袜天使 | BD 全集+SP |
| 未追 | 命运石之门 | 全集+剧场版+0 |
| 未追 | 地缚少年花子君 S1 | BD |
| 未追 | 彻夜之歌 | WebRip 外挂字幕 |
| 未追 | 我心里危险的东西 S1 | BD |
| 未追 | 盾之勇者成名录 | S1+S2+S3 BD |
| 未追 | 石纪元 | S1+S2+S3（3种来源） |

**补番区小计：约 18 部作品**（几乎所有都是 BD 外挂字幕）

---

## 六、总结

- **F 盘实际番剧总数**：约 **140+ 部/季**（去重后大约 120-130 部独立作品）
- **扫描器能正确识别的**：约 70%（扁平结构、内嵌字幕的 MP4）
- **扫描器会出问题的**：约 30%（BD合集嵌套、子目录含视频、深层嵌套、多版本并存）
- **最需要修复的问题**：
  1. 跳过 PV/menu/特典映像/SPs 子目录中的视频
  2. 当父目录无视频时，向上回退使用父目录名作为系列标题
  3. BD 合集子目录的自动合并（同系列多季分散在多个子目录）
