/**
 * 番剧简介翻译引擎 — 基于句式模板的本地翻译（零网络、零模型）
 *
 * 策略：
 *   1. 句式匹配（完整从句 → 中文）
 *   2. 高频短语替换
 *   3. 保留处理不了的部分（比纯英文强）
 */

// ===== 句式模板：完整从句翻译 =====
// 按长度降序排列，长句优先匹配
const SENTENCE_TEMPLATES: [RegExp, string][] = [
  // --- 主角设定 ---
  [
    /(\w+(?:\s+\w+){0,4})\s+is\s+a\s+(high\s*school\s*student|teenager|young\s*(?:boy|girl|man|woman))\s+who\s+(has\s+(?:always\s+)?(?:been\s+)?|possesses?|dreams?\s+of)\b/gi,
    '$1是一名$2，一直',
  ],
  [
    /(\w+(?:\s+\w+){0,4})\s+is\s+an?\s+(ordinary|average|normal|typical)\s+(high\s*school\s*student|boy|girl|teenager|person|young\s*man|young\s*woman)\b/gi,
    '$1是一个普通的$3',
  ],
  [
    /(\w+(?:\s+\w+){0,4})\s+is\s+a\s+(genius|prodigy|gifted)\s+(student|child|boy|girl|teenager|young\s*(?:man|woman))\b/gi,
    '$1是一个天才$3',
  ],
  [
    /(\w+(?:\s+\w+){0,4})\s+is\s+an?\s+(orphan|outcast|loner|introvert|shut-in|hikikomori|NEET)\b/gi,
    '$1是一个$2',
  ],

  // --- 转学/入学/新生活 ---
  [
    /transfers?\s+to\s+(?:a\s+)?(?:new\s+)?(?:school|academy|university|college)\b/gi,
    '转学到了新的学校',
  ],
  [
    /enrolls?\s+(?:in|at|into)\s+(?:the\s+)?[\w\s]+?(?:academy|school|university|college)\b/gi,
    '进入了学园',
  ],
  [/moves?\s+to\s+(?:a\s+)?(?:new\s+)?(?:town|city|village|place|apartment)\b/gi, '搬到了新的地方'],
  [/starts?\s+(?:his|her|their)\s+(?:new\s+)?life\s+(?:as|in|at)\b/gi, '开始了新的生活'],
  [/begins?\s+(?:his|her|their)\s+(?:first|new)\s+(?:year|semester|term)\b/gi, '开始了新学期'],

  // --- 能力觉醒/获得力量 ---
  [
    /suddenly\s+(?:discovers?|finds?|realizes?|learns?)\s+that\s+(?:he|she|they)\s+(?:has|have|possess)\s+(?:a\s+)?(?:special|mysterious|hidden|unique|strange)\s+(?:power|ability|gift|talent)\b/gi,
    '突然发现自己拥有特殊能力',
  ],
  [
    /awakens?\s+(?:to|his|her|their)\s+(?:true\s+)?(?:power|ability|potential|strength)\b/gi,
    '觉醒了真正的力量',
  ],
  [/gains?\s+(?:the\s+)?(?:power|ability)\s+(?:to|of)\s+/gi, '获得了...的能力'],
  [
    /is\s+(?:blessed|cursed)\s+with\s+(?:the\s+)?(?:power|ability)\s+(?:to|of)\s+/gi,
    '被赋予了...的能力',
  ],

  // --- 穿越/异世界 ---
  [
    /is\s+(?:suddenly\s+)?transported\s+to\s+(?:a|an|another|a\s+different)\s+world\b/gi,
    '被传送到了异世界',
  ],
  [
    /wakes?\s+up\s+(?:to\s+find\s+(?:himself|herself|themselves)\s+)?in\s+(?:a|an|another)\s+world\b/gi,
    '醒来后发现自己身处异世界',
  ],
  [
    /is\s+(?:reincarnated|reborn)\s+(?:as|in|into)\s+(?:a|an|another)\s+world\b/gi,
    '转生到了异世界',
  ],
  [
    /gets?\s+transported\s+(?:to|into)\s+(?:a|an)\s+(?:fantasy|parallel|different)\s+world\b/gi,
    '被传送到了异世界',
  ],
  [
    /finds?\s+(?:himself|herself|themselves)\s+in\s+(?:a|an|another|a\s+different)\s+world\b/gi,
    '发现自己身处异世界',
  ],
  [/summoned\s+to\s+(?:a|an|another)\s+world\b/gi, '被召唤到了异世界'],
  [/trapped\s+in\s+(?:a|an)\s+(?:virtual|game|fantasy|MMO)\s+world\b/gi, '被困在了游戏世界'],
  [/can'?t\s+log\s+out\s+(?:of|from)\s+(?:the\s+)?(?:game|virtual\s+world)\b/gi, '无法退出游戏'],

  // --- 命运/使命 ---
  [/destined\s+to\s+(?:save|protect|destroy|become|rule)\b/gi, '注定要'],
  [
    /must\s+(?:save|protect|defend|rescue)\s+(?:the\s+)?(?:world|kingdom|country|city|village|people)\b/gi,
    '必须拯救',
  ],
  [/chosen\s+(?:as|to\s+be|by)\s+(?:the\s+)?[\w\s]+?\b/gi, '被选中'],
  [
    /fate\s+(?:brings?|has\s+brought)\s+(?:him|her|them)\s+(?:to|together\s+with)\b/gi,
    '命运将ta带到了',
  ],
  [/prophecy\s+(?:foretold|predicted|speaks?\s+of)\b/gi, '预言提到'],

  // --- 相遇/邂逅 ---
  [
    /meets?\s+(?:a|an|the)\s+(?:mysterious|strange|beautiful|handsome|enigmatic)\s+(?:girl|boy|woman|man|person|stranger)\b/gi,
    '遇到了一位神秘的',
  ],
  [
    /encounters?\s+(?:a|an)\s+(?:mysterious|strange|unknown)\s+(?:girl|boy|woman|man|being|creature|entity)\b/gi,
    '邂逅了一位神秘的',
  ],
  [/comes?\s+across\s+(?:a|an)\s+(?:mysterious|strange)\b/gi, '偶然遇到了'],
  [/runs?\s+into\s+(?:a|an)\s+(?:old\s+)?(?:friend|acquaintance|rival|enemy)\b/gi, '重逢了'],

  // --- 战斗/冒险 ---
  [
    /embarks?\s+on\s+(?:a|an)\s+(?:journey|adventure|quest|mission)\s+to\b/gi,
    '踏上了前往...的旅程',
  ],
  [/sets?\s+out\s+(?:on|to)\s+(?:a\s+)?(?:journey|quest|adventure|mission)\b/gi, '出发去'],
  [/joins?\s+(?:forces|hands)\s+with\b/gi, '联手'],
  [/team(?:s|ed)\s+up\s+with\b/gi, '合作'],
  [/fights?\s+(?:against|to\s+protect|to\s+save|to\s+defeat)\b/gi, '战斗中'],
  [/battles?\s+(?:against|with)\s+(?:the\s+)?(?:demon|monster|enemy|evil|dark)\b/gi, '与...战斗'],

  // --- 恋爱/感情 ---
  [/falls?\s+in\s+love\s+with\b/gi, '爱上了'],
  [/develops?\s+feelings?\s+for\b/gi, '对...产生了感情'],
  [/confesses?\s+(?:his|her|their)\s+(?:love|feelings)\s+to\b/gi, '向...告白'],
  [/love\s+triangle\s+(?:between|among|involving)\b/gi, '三角恋'],
  [
    /childhood\s+friend\s+who\s+(?:has\s+always\s+)?(?:been|loved|liked|had\s+a\s+crush)\b/gi,
    '青梅竹马一直',
  ],
  [/promised\s+to\s+marry\s+(?:each\s+other|him|her)\s+(?:when|if|after)\b/gi, '约定长大后结婚'],

  // --- 秘密/真相 ---
  [
    /discovers?\s+(?:the|a)\s+(?:truth|secret|mystery)\s+(?:behind|about|of)\b/gi,
    '发现了背后的真相',
  ],
  [/hidden\s+(?:truth|secret|past|identity)\s+(?:is|behind|about)\b/gi, '隐藏的秘密'],
  [
    /(\w+(?:\s+\w+){0,3})\s+is\s+not\s+who\s+(?:he|she|they)\s+(?:seems?|appears?\s+to\s+be)\b/gi,
    '$1的真实身份并非表面所见',
  ],
  [/has\s+been\s+keeping\s+(?:a|the)\s+secret\b/gi, '一直保守着秘密'],
  [/dark\s+(?:secret|past|history|truth)\b/gi, '黑暗的秘密'],
  [
    /true\s+(?:identity|nature|form|power)\s+(?:is|was|has\s+been)\s+revealed\b/gi,
    '真实身份被揭开',
  ],
  [
    /things?\s+(?:are|is|were)\s+not\s+(?:what|as)\s+(?:they|it)\s+(?:seem|appear)\b/gi,
    '事情并非表面所见',
  ],

  // --- 校园生活 ---
  [/joins?\s+(?:the|a)\s+(?:club|society|team|committee)\b/gi, '加入了社团'],
  [/student\s+council\b/gi, '学生会'],
  [/cultural\s+festival\b/gi, '文化祭'],
  [/sports?\s+(?:festival|day|meet|competition|tournament)\b/gi, '体育祭'],
  [/school\s+(?:festival|trip|excursion)\b/gi, '学园祭'],
  [/after\s+school\b/gi, '放学后'],
  [/classroom\b/gi, '教室'],

  // --- 时间/结局 ---
  [
    /in\s+the\s+(?:end|final|last)\s+(?:battle|confrontation|showdown|episode)\b/gi,
    '在最终的对决中',
  ],
  [
    /as\s+(?:the\s+)?(?:time|story|series)\s+(?:goes?\s+on|progresses?|continues?)\b/gi,
    '随着故事的发展',
  ],
  [
    /after\s+(?:the|a)\s+(?:long|fierce|intense|desperate)\s+(?:battle|struggle|fight)\b/gi,
    '经过一场激烈的战斗后',
  ],
  [/in\s+order\s+to\s+(?:save|protect|rescue|defeat|stop|prevent)\b/gi, '为了'],
  [/for\s+the\s+sake\s+of\s+(?:the\s+)?(?:world|humanity|everyone|all)\b/gi, '为了整个世界'],

  // --- 常用连接/过渡 ---
  [/however[,\s]+/gi, '然而，'],
  [/but\s+then[,\s]+/gi, '但是，'],
  [/one\s+day[,\s]+/gi, '有一天，'],
  [/suddenly[,\s]+/gi, '突然，'],
  [/eventually[,\s]+/gi, '最终，'],
  [/meanwhile[,\s]+/gi, '与此同时，'],
  [/unfortunately[,\s]+/gi, '不幸的是，'],
  [/fortunately[,\s]+/gi, '幸运的是，'],
  [/together[,\s]+they\s+/gi, '他们一起'],
  [/along\s+the\s+way[,\s]+/gi, '一路上，'],
  [
    /along\s+with\s+(?:his|her|their)\s+(?:friends?|companions?|allies?|comrades?)\b/gi,
    '和同伴们一起',
  ],
  [
    /with\s+the\s+help\s+of\s+(?:his|her|their)\s+(?:friends?|allies?|companions?)\b/gi,
    '在同伴的帮助下',
  ],
  [/little\s+does?\s+(?:he|she|they)\s+know\b/gi, 'ta还不知道'],
  [/what\s+(?:he|she|they)\s+doesn'?t\s+know\s+is\b/gi, 'ta不知道的是'],

  // --- 作者/原作 ---
  [
    /based\s+on\s+(?:the\s+)?(?:popular|best-selling|hit|award-winning)?\s*(?:manga|light\s+novel|novel|web\s+novel|visual\s+novel|game)\b/gi,
    '改编自热门',
  ],
  [/written\s+by\s+[\w\s]+?(?:and\s+)?(?:illustrated\s+by\s+[\w\s]+?)?\b/gi, ''],
  [/created\s+by\s+[\w\s]+?\b/gi, '由...创作'],
  [/produced\s+by\s+(?:the\s+)?(?:studio\s+)?[\w\s]+?\b/gi, '由...制作'],
  [/animated\s+by\s+(?:the\s+)?(?:studio\s+)?[\w\s]+?\b/gi, '由...动画化'],

  // --- 死后/复活 ---
  [/after\s+(?:being\s+)?(?:killed|murdered|dying|death)\b/gi, '在死后，'],
  [/comes?\s+back\s+(?:to\s+)?life\b/gi, '复活了'],
  [/returns?\s+from\s+(?:the\s+)?(?:dead|death|grave)\b/gi, '从死亡中归来'],
  [/is\s+(?:brought|comes?)\s+back\s+(?:to\s+life|from\s+the\s+dead)\b/gi, '被复活'],

  // --- 复仇 ---
  [/seeks?\s+(?:revenge|vengeance|retribution)\s+(?:against|on|for)\b/gi, '寻求复仇'],
  [/vows?\s+(?:revenge|vengeance|to\s+avenge)\b/gi, '发誓复仇'],
  [/swears?\s+(?:revenge|vengeance|to\s+avenge|to\s+get\s+revenge)\b/gi, '发誓要复仇'],
  [/out\s+for\s+(?:revenge|vengeance)\b/gi, '为了复仇'],

  // --- 长大/变强 ---
  [/grows?\s+(?:stronger|in\s+power|in\s+strength)\b/gi, '逐渐变强'],
  [/trains?\s+(?:hard|relentlessly|tirelessly)\b/gi, '刻苦训练'],
  [
    /wants?\s+to\s+become\s+(?:the\s+)?(?:strongest|best|greatest|number\s+one)\b/gi,
    '想要成为最强',
  ],
  [/dreams?\s+of\s+becoming\s+(?:the\s+)?(?:strongest|best|greatest)\b/gi, '梦想成为最强'],

  // --- 家族/血统 ---
  [/born\s+(?:into|in)\s+(?:a|the)\s+(?:noble|royal|rich|powerful)\s+family\b/gi, '出生于贵族家庭'],
  [
    /last\s+(?:of|surviving\s+member\s+of)\s+(?:his|her|their)\s+(?:clan|family|tribe|race|kind)\b/gi,
    '家族最后的幸存者',
  ],
  [/descendant\s+of\s+(?:the\s+)?(?:legendary|ancient|mythical)\b/gi, '传说的后裔'],

  // --- 时间循环/穿越 ---
  [/stuck\s+in\s+(?:a|an)\s+(?:time|endless)\s+loop\b/gi, '困在了时间循环中'],
  [
    /reliving?\s+(?:the\s+)?(?:same\s+)?(?:day|moment|week)\s+(?:over\s+and\s+over|again)\b/gi,
    '不断重复同一天',
  ],
  [/goes?\s+back\s+in\s+time\b/gi, '回到了过去'],
  [/time\s+(?:travel|traveler|leap)\b/gi, '时间旅行'],

  // --- 战斗竞赛 ---
  [
    /participates?\s+in\s+(?:a|the)\s+(?:battle\s+royale|death\s+game|survival\s+game|tournament)\b/gi,
    '参加了生死竞赛',
  ],
  [/forced\s+to\s+(?:fight|compete|participate)\s+in\s+(?:a|the)\b/gi, '被迫参加'],
  [/battle\s+royale\b/gi, '大逃杀'],
  [/death\s+game\b/gi, '死亡游戏'],

  // --- 组织/势力 ---
  [/joins?\s+(?:the|a)\s+(?:military|army|police|organization|resistance|rebellion)\b/gi, '加入了'],
  [
    /part\s+of\s+(?:a|the)\s+(?:secret|elite|special)\s+(?:organization|squad|unit|team|force)\b/gi,
    '属于秘密组织',
  ],
  [/secret\s+(?:organization|society|group|order)\b/gi, '秘密组织'],

  // --- 世界设定 ---
  [/in\s+(?:a|the)\s+world\s+where\s+[\w\s]+?\s+(?:is|are|exist|rule)\b/gi, '在一个...的世界里，'],
  [/set\s+in\s+(?:a|the)\s+(?:world|future|past|era)\s+where\b/gi, '故事发生在一个...的世界'],
  [/post-apocalyptic\s+world\b/gi, '末世'],
  [/dystopian\s+(?:future|world|society)\b/gi, '反乌托邦未来'],

  // --- 关系 ---
  [/complicated\s+relationship\b/gi, '复杂的关系'],
  [/growing?\s+(?:closer|closer\s+together|apart)\b/gi, '关系逐渐变化'],
  [/unexpected\s+(?:ally|friend|partner|companion)\b/gi, '意外的伙伴'],
  [/reluctant\s+(?:hero|ally|partner)\b/gi, '不情愿的'],
  [/unlikely\s+(?:friendship|alliance|partnership|bond)\b/gi, '不可思议的羁绊'],
]

// ===== 单词/短语替换（句式匹配后执行） =====
const PHRASE_MAP: [RegExp, string][] = [
  // 学校/教育
  [/\bhigh\s*school\b/gi, '高中'],
  [/\bmiddle\s*school\b/gi, '初中'],
  [/\belementary\s*school\b/gi, '小学'],
  [/\bacademy\b/gi, '学园'],
  [/\buniversity\b/gi, '大学'],
  [/\btransfer\s*student\b/gi, '转校生'],
  [/\bstudent\s*council\b/gi, '学生会'],
  [/\bclassmate\b/gi, '同学'],
  [/\bgraduate\b/gi, '毕业生'],
  [/\bfreshman\b/gi, '新生'],
  [/\bsenior\b/gi, '前辈'],

  // 角色身份
  [/\bprotagonist\b/gi, '主角'],
  [/\bheroine\b/gi, '女主角'],
  [/\bhero\b/gi, '勇者'],
  [/\bdemon\s*lord\b/gi, '魔王'],
  [/\bdemon\s*king\b/gi, '魔王'],
  [/\bdemon\b/gi, '恶魔'],
  [/\bgoddess\b/gi, '女神'],
  [/\bdragon\b/gi, '龙'],
  [/\bsword\b/gi, '剑'],
  [/\bmagic\b/gi, '魔法'],
  [/\bdungeon\b/gi, '迷宫'],
  [/\bguild\b/gi, '公会'],
  [/\badventurer\b/gi, '冒险者'],
  [/\bkingdom\b/gi, '王国'],
  [/\bempire\b/gi, '帝国'],
  [/\bprincess\b/gi, '公主'],
  [/\bprince\b/gi, '王子'],
  [/\bknight\b/gi, '骑士'],
  [/\bsamurai\b/gi, '武士'],
  [/\bninja\b/gi, '忍者'],
  [/\bmaid\b/gi, '女仆'],
  [/\bidol\b/gi, '偶像'],
  [/\bdetective\b/gi, '侦探'],
  [/\bassassin\b/gi, '杀手'],
  [/\bmercenary\b/gi, '雇佣兵'],
  [/\bwarlord\b/gi, '军阀'],
  [/\bnoble\b/gi, '贵族'],
  [/\bcommoner\b/gi, '平民'],
  [/\bslave\b/gi, '奴隶'],
  [/\bruler\b/gi, '统治者'],
  [/\bemperor\b/gi, '皇帝'],
  [/\bempress\b/gi, '女皇'],
  [/\bpriest\b/gi, '祭司'],
  [/\bpriestess\b/gi, '女祭司'],
  [/\bdoctor\b/gi, '医生'],
  [/\bteacher\b/gi, '老师'],
  [/\bmaster\b/gi, '师傅'],
  [/\bapprentice\b/gi, '学徒'],
  [/\bwarrior\b/gi, '战士'],
  [/\bmage\b/gi, '魔法师'],
  [/\bsorcerer\b/gi, '巫师'],
  [/\bsorceress\b/gi, '女巫'],
  [/\bnecromancer\b/gi, '死灵法师'],
  [/\barcher\b/gi, '弓箭手'],
  [/\bswordsman\b/gi, '剑士'],
  [/\bswordswoman\b/gi, '女剑士'],
  [/\bhealer\b/gi, '治疗者'],
  [/\bcleric\b/gi, '牧师'],
  [/\bpaladin\b/gi, '圣骑士'],
  [/\bthief\b/gi, '盗贼'],
  [/\bbard\b/gi, '吟游诗人'],
  [/\bsummoner\b/gi, '召唤师'],
  [/\bbeastmaster\b/gi, '驯兽师'],
  [/\balchemist\b/gi, '炼金术师'],

  // 种族/生物
  [/\bmonster\b/gi, '怪物'],
  [/\bghost\b/gi, '幽灵'],
  [/\bspirit\b/gi, '精灵'],
  [/\bvampire\b/gi, '吸血鬼'],
  [/\bwerewolf\b/gi, '狼人'],
  [/\bwitch\b/gi, '魔女'],
  [/\bwizard\b/gi, '魔法师'],
  [/\bangel\b/gi, '天使'],
  [/\bdeity\b/gi, '神明'],
  [/\bimmortal\b/gi, '不死者'],
  [/\blich\b/gi, '巫妖'],
  [/\bgoblin\b/gi, '哥布林'],
  [/\borc\b/gi, '兽人'],
  [/\belf\b/gi, '精灵'],
  [/\bdwarf\b/gi, '矮人'],
  [/\bgiant\b/gi, '巨人'],
  [/\bfairy\b/gi, '妖精'],
  [/\bmermaid\b/gi, '人鱼'],
  [/\bphoenix\b/gi, '凤凰'],
  [/\bgriffin\b/gi, '狮鹫'],
  [/\bwerebeast\b/gi, '兽化人'],
  [/\bzombie\b/gi, '丧尸'],
  [/\bskeleton\b/gi, '骷髅'],
  [/\bslime\b/gi, '史莱姆'],
  [/\bminotaur\b/gi, '牛头人'],
  [/\bchimera\b/gi, '奇美拉'],
  [/\bhydra\b/gi, '九头蛇'],
  [/\bogre\b/gi, '食人魔'],
  [/\btroll\b/gi, '巨魔'],

  // 感情/关系
  [/\bconfession\b/gi, '告白'],
  [/\bcrush\b/gi, '暗恋'],
  [/\bfirst\s*love\b/gi, '初恋'],
  [/\bchildhood\s*friend\b/gi, '青梅竹马'],
  [/\brival\b/gi, '对手'],
  [/\ballies?\b/gi, '盟友'],
  [/\bcomrades?\b/gi, '同伴'],
  [/\bfriend\b/gi, '朋友'],
  [/\benemy\b/gi, '敌人'],
  [/\bpartner\b/gi, '搭档'],
  [/\bcompanion\b/gi, '伙伴'],
  [/\bmentor\b/gi, '导师'],
  [/\bprotégé\b/gi, '弟子'],
  [/\bsibling\b/gi, '兄弟姐妹'],
  [/\btwin\b/gi, '双胞胎'],
  [/\bstep[- ]?(?:sister|brother|mother|father|sibling)\b/gi, '继'],
  [/\bladopted\b/gi, '养'],
  [/\bengagement\b/gi, '婚约'],
  [/\bwedding\b/gi, '婚礼'],
  [/\bmarriage\b/gi, '婚姻'],
  [/\bdivorce\b/gi, '离婚'],
  [/\brelationship\b/gi, '关系'],

  // 地点
  [/\btokyo\b/gi, '东京'],
  [/\bjapan\b/gi, '日本'],
  [/\bcastle\b/gi, '城堡'],
  [/\btemple\b/gi, '寺庙'],
  [/\bshrine\b/gi, '神社'],
  [/\bvillage\b/gi, '村庄'],
  [/\btown\b/gi, '城镇'],
  [/\bcity\b/gi, '城市'],
  [/\bcapital\b/gi, '首都'],
  [/\bpalace\b/gi, '宫殿'],
  [/\bforest\b/gi, '森林'],
  [/\bmountain\b/gi, '山'],
  [/\bocean\b/gi, '海洋'],
  [/\bsea\b/gi, '大海'],
  [/\briver\b/gi, '河流'],
  [/\bdesert\b/gi, '沙漠'],
  [/\bunderworld\b/gi, '地下世界'],
  [/\bheaven\b/gi, '天国'],
  [/\bhell\b/gi, '地狱'],
  [/\babyss\b/gi, '深渊'],
  [/\btower\b/gi, '塔'],
  [/\blabyrinth\b/gi, '迷宫'],

  // 冲突/概念
  [/\bmystery\b/gi, '谜团'],
  [/\bwar\b/gi, '战争'],
  [/\bbattle\b/gi, '战斗'],
  [/\bcurse\b/gi, '诅咒'],
  [/\bfate\b/gi, '命运'],
  [/\bdestiny\b/gi, '命运'],
  [/\bprophecy\b/gi, '预言'],
  [/\breincarnation\b/gi, '转生'],
  [/\bisekai\b/gi, '异世界'],
  [/\bparallel\s*world\b/gi, '平行世界'],
  [/\bdimension\b/gi, '次元'],
  [/\brealm\b/gi, '领域'],
  [/\btournament\b/gi, '大赛'],
  [/\bcompetition\b/gi, '比赛'],
  [/\bchallenge\b/gi, '挑战'],
  [/\bquest\b/gi, '任务'],
  [/\bmission\b/gi, '使命'],
  [/\bcrusade\b/gi, '圣战'],
  [/\brebellion\b/gi, '叛乱'],
  [/\brevolution\b/gi, '革命'],
  [/\buprising\b/gi, '起义'],
  [/\bconspiracy\b/gi, '阴谋'],
  [/\bbetrayal\b/gi, '背叛'],
  [/\bsacrifice\b/gi, '牺牲'],
  [/\bredemption\b/gi, '救赎'],
  [/\bcorruption\b/gi, '腐败'],
  [/\bdestruction\b/gi, '毁灭'],
  [/\bapocalypse\b/gi, '末日'],
  [/\bcatastrophe\b/gi, '灾难'],
  [/\bcalamity\b/gi, '灾厄'],
  [/\bdisaster\b/gi, '灾难'],
  [/\bmiracle\b/gi, '奇迹'],
  [/\btragedy\b/gi, '悲剧'],
  [/\bcomedic\b/gi, '喜剧的'],
  [/\bromantic\s*comedy\b/gi, '恋爱喜剧'],
  [/\brom-com\b/gi, '恋爱喜剧'],
  [/\baction\b/gi, '动作'],
  [/\bcomedy\b/gi, '喜剧'],
  [/\bdrama\b/gi, '剧情'],
  [/\bhorror\b/gi, '恐怖'],
  [/\bthriller\b/gi, '惊悚'],
  [/\bsuspense\b/gi, '悬疑'],

  // 时间
  [/\bfuture\b/gi, '未来'],
  [/\bpast\b/gi, '过去'],
  [/\bpresent\b/gi, '现在'],
  [/\bcentury\b/gi, '世纪'],
  [/\bdecade\b/gi, '十年'],
  [/\bthousand\s+years?\b/gi, '千年'],
  [/\bhundred\s+years?\b/gi, '百年'],
  [/\bancient\s+times?\b/gi, '古代'],
  [/\bmodern\s+(?:day|times?|era|age)\b/gi, '现代'],
  [/\bmedieval\b/gi, '中世纪'],

  // 常见动词短语
  [/\bhas\s+(?:always\s+)?(?:been|dreamed|wanted|wished)\b/gi, '一直'],
  [/\bused\s+to\s+be\b/gi, '曾经是'],
  [/\bis\s+(?:determined|resolved)\s+to\b/gi, '决心要'],
  [/\btries?\s+(?:his|her|their)\s+best\s+to\b/gi, '尽全力'],
  [/\bstruggles?\s+(?:to|with)\b/gi, '努力'],
  [/\blearns?\s+(?:to|that|how|about)\b/gi, '学会了'],
  [/\brealizes?\s+(?:that|the)\b/gi, '意识到了'],
  [/\bunderstands?\s+(?:that|the|what)\b/gi, '理解了'],
  [/\bdiscovers?\s+(?:that|the|a)\b/gi, '发现了'],

  // 获取/损失
  [
    /\bgain(?:\s+|s\s+|ed\s+|ing\s+)(?:the\s+)?(?:power|ability|strength|knowledge)\b/gi,
    '获得了力量',
  ],
  [/\bloses?\s+(?:his|her|their)\s+(?:memory|memories|power|family|friend|home)\b/gi, '失去了'],
  [/\bsearching?\s+for\s+(?:a|the|his|her|their)\b/gi, '寻找'],
  [/\blooking?\s+for\b/gi, '寻找'],
  [/\bseeking?\b/gi, '寻求'],
  [/\bfinds?\s+(?:out|that|the|a)\b/gi, '发现'],
  [/\bprotects?\b/gi, '保护'],
  [/\bdefends?\b/gi, '守护'],
  [/\brescues?\b/gi, '拯救'],

  // 形容词/状态
  [/\bmysterious\b/gi, '神秘的'],
  [/\bstrange\b/gi, '奇怪的'],
  [/\bbeautiful\b/gi, '美丽的'],
  [/\bpowerful\b/gi, '强大的'],
  [/\bdangerous\b/gi, '危险的'],
  [/\bpeaceful\b/gi, '和平的'],
  [/\bdark(?:ness)?\b/gi, '黑暗'],
  [/\blight\b/gi, '光明'],
  [/\bordinary\b/gi, '普通的'],
  [/\bnormal\b/gi, '正常的'],
  [/\bspecial\b/gi, '特别的'],
  [/\bunique\b/gi, '独特的'],
  [/\bhidden\b/gi, '隐藏的'],
  [/\bsecret\b/gi, '秘密的'],
  [/\bforbidden\b/gi, '禁忌的'],
  [/\blegendary\b/gi, '传说的'],
  [/\bmythical\b/gi, '神话的'],
  [/\bancient\b/gi, '古老的'],
  [/\bbrave\b/gi, '勇敢的'],
  [/\bcourageous\b/gi, '无畏的'],
  [/\bkind(?:ness)?\b/gi, '善良'],
  [/\bgentle\b/gi, '温柔的'],
  [/\bfierce\b/gi, '凶猛的'],
  [/\bmerciless\b/gi, '无情的'],
  [/\bmagnificent\b/gi, '华丽的'],
  [/\bgrand\b/gi, '宏大的'],
  [/\bepic\b/gi, '史诗的'],
  [/\bthrilling\b/gi, '惊心动魄的'],
  [/\bheartbreaking\b/gi, '令人心碎的'],
  [/\bheartwarming\b/gi, '温馨的'],
  [/\bhilarious\b/gi, '搞笑的'],
  [/\bexciting\b/gi, '激动人心的'],
  [/\bthrilling\b/gi, '激动人心的'],

  // 身体/能力
  [/\bpower\b/gi, '力量'],
  [/\bability\b/gi, '能力'],
  [/\btalent\b/gi, '才能'],
  [/\bskill\b/gi, '技能'],
  [/\bstrength\b/gi, '力量'],
  [/\bmagic\s*(?:al\s+)?power\b/gi, '魔力'],
  [/\bmana\b/gi, '魔力'],
  [/\bki\b/gi, '气'],
  [/\bchakra\b/gi, '查克拉'],
  [/\bsoul\b/gi, '灵魂'],
  [/\bmind\b/gi, '心灵'],
  [/\bheart\b/gi, '心'],
  [/\bwill\b/gi, '意志'],
  [/\bcourage\b/gi, '勇气'],
  [/\bdetermination\b/gi, '决心'],

  // 学校生活
  [/\bclass\b/gi, '班级'],
  [/\bhomework\b/gi, '作业'],
  [/\bexam\b/gi, '考试'],
  [/\btest\b/gi, '测验'],
  [/\bgrade\b/gi, '成绩'],
  [/\bgraduation\b/gi, '毕业'],
  [/\bentrance\s*(?:exam|ceremony)\b/gi, '入学'],
  [/\bschool\s*day\b/gi, '上学日'],
  [/\buniform\b/gi, '制服'],
  [/\blocker\b/gi, '储物柜'],
  [/\bcafeteria\b/gi, '食堂'],
  [/\bdorm(?:itory)?\b/gi, '宿舍'],
  [/\brooftop\b/gi, '天台'],

  // 日常生活
  [/\bconvenience\s*store\b/gi, '便利店'],
  [/\bpart[- ]?time\s*job\b/gi, '打工'],
  [/\bsalary\b/gi, '工资'],
  [/\bhospital\b/gi, '医院'],
  [/\blibrary\b/gi, '图书馆'],
  [/\bgarden\b/gi, '花园'],
  [/\bpark\b/gi, '公园'],
  [/\bbeach\b/gi, '海滩'],
  [/\bhot\s*spring\b/gi, '温泉'],
  [/\bbath(?:house)?\b/gi, '澡堂'],
]

/**
 * 本地翻译简介（句式模板 + 短语替换）
 * 返回翻译后的文本，无法翻译的部分保留原文
 */
export function translateSynopsisLocal(text: string): string {
  if (!text) return text
  const hasChinese = /[\u4e00-\u9fff]/.test(text)
  if (hasChinese) return text

  let result = text

  // 第一遍：句式模板匹配（从句级翻译）
  for (const [regex, replacement] of SENTENCE_TEMPLATES) {
    result = result.replace(regex, replacement)
  }

  // 第二遍：单词/短语替换
  for (const [regex, replacement] of PHRASE_MAP) {
    result = result.replace(regex, replacement)
  }

  // 清理多余空格
  result = result.replace(/\s{2,}/g, ' ').trim()

  return result || text
}

// ============================================================
//  类型标签 + Staff + 季度翻译（轻量词典）
// ============================================================

const GENRE_DICT: Record<string, string> = {
  action: '动作',
  adventure: '冒险',
  comedy: '喜剧',
  drama: '剧情',
  fantasy: '奇幻',
  horror: '恐怖',
  mystery: '悬疑',
  romance: '恋爱',
  'sci-fi': '科幻',
  'slice of life': '日常',
  sports: '运动',
  supernatural: '超自然',
  thriller: '惊悚',
  mecha: '机甲',
  music: '音乐',
  psychological: '心理',
  historical: '历史',
  military: '军事',
  school: '校园',
  magic: '魔法',
  ecchi: '卖肉',
  shounen: '少年',
  seinen: '青年',
  shoujo: '少女',
  josei: '女性',
  isekai: '异世界',
  harem: '后宫',
  gourmet: '美食',
  'boys love': '耽美',
  'girls love': '百合',
  vampire: '吸血鬼',
  'martial arts': '武术',
  samurai: '武士',
  'post-apocalyptic': '末世',
  'super power': '超能力',
  tragedy: '悲剧',
  parody: '恶搞',
  'coming of age': '成长',
  'ensemble cast': '群像剧',
  reincarnation: '转生',
  survival: '生存',
  detective: '侦探',
  'award winning': '获奖',
  'love polygon': '多角恋',
  'reverse harem': '逆后宫',
  'urban fantasy': '都市奇幻',
  'virtual world': '虚拟世界',
  workplace: '职场',
  'idols (female)': '女性偶像',
  'idols (male)': '男性偶像',
  space: '太空',
  'time travel': '时间旅行',
  steampunk: '蒸汽朋克',
  mythology: '神话',
  'organized crime': '黑帮',
  // 补充冷门标签
  anthropomorphic: '拟人',
  cgdct: '萌系日常',
  educational: '教育',
  crossdressing: '女装',
  'gender bender': '性转',
  'mahou shoujo': '魔法少女',
  racing: '赛车',
  'performing arts': '表演艺术',
  pets: '宠物',
  iyashikei: '治愈',
  showbiz: '演艺圈',
  'team sports': '团队运动',
  'combat sports': '格斗运动',
  'high stakes game': '博弈',
  medical: '医疗',
  'otaku culture': '御宅文化',
  'video game': '电子游戏',
  'adult cast': '成人主角',
  childcare: '育儿',
  delinquents: '不良少年',
  'family life': '家庭生活',
  hikikomori: '家里蹲',
  revenge: '复仇',
  'school club': '社团',
  zombie: '丧尸',
  gag: '搞笑',
  'road trip': '公路',
  aviation: '航空',
  guns: '枪战',
  'body horror': '肉体恐怖',
  dementia: '精神错乱',
  demons: '恶魔',
  game: '游戏',
  police: '警察',
  'visual arts': '视觉艺术',
  'strategy game': '策略游戏',
  'card battle': '卡牌对战',
}

const ROLE_DICT: Record<string, string> = {
  // 核心制作
  director: '监督',
  'assistant director': '副监督',
  'episode director': '演出',
  'series director': '系列监督',
  'sound director': '音响监督',
  'art director': '美术监督',
  'animation director': '作画监督',
  'chief animation director': '总作画监督',
  'director of photography': '摄影监督',
  '3d director': '3D监督',
  'cgi director': 'CGI监督',
  'voice director': '音响监督',
  // 剧本/构成
  'series composition': '系列构成',
  script: '剧本',
  screenplay: '脚本',
  storyboard: '分镜',
  'original creator': '原作',
  'original story': '原作',
  mangaka: '漫画家',
  // 角色/美术
  'character design': '角色设计',
  'original character design': '角色原案',
  'mechanical design': '机械设计',
  'color design': '色彩设计',
  'background art': '背景美术',
  'art design': '美术设计',
  setting: '设定',
  layout: '构图',
  // 音乐/音效
  music: '音乐',
  composer: '作曲',
  'theme song performance': '主题歌',
  'theme song lyrics': '作词',
  'theme song composition': '作曲',
  'theme song arrangement': '编曲',
  'sound effects': '音效',
  // 作画
  'key animation': '原画',
  animator: '动画师',
  'in-between animation': '中间帧',
  '2nd key animation': '第二原画',
  finishing: '上色',
  'finishing check': '上色检查',
  // 摄影/后期
  photography: '摄影',
  editing: '剪辑',
  'special effects': '特效',
  'digital effects': '数码特效',
  // 制作管理
  producer: '制作人',
  'animation producer': '动画制作人',
  'executive producer': '总制作人',
  'line producer': '制作担当',
  'production manager': '制作进行',
  planning: '企划',
  production: '制作',
  // 其他
  'cg supervisor': 'CG总监',
  'prop design': '道具设计',
  'creature design': '生物设计',
  'costume design': '服装设计',
  'weapon design': '武器设计',
  'food design': '食物设计',
  'monster design': '怪物设计',
  'sub character design': '配角设计',
  'action animation direction': '动作作画监督',
  'title logo design': '标题设计',
  'opening animation': '片头动画',
  'ending animation': '片尾动画',
  'insert song performance': '插曲',
  choreographer: '编舞',
  // AniList 特有格式
  'Original Creator': '原作',
  Director: '监督',
  'Character Design': '角色设计',
  'Series Composition': '系列构成',
  Music: '音乐',
  Producer: '制作人',
  'Animation Director': '作画监督',
  'Sound Director': '音响监督',
  'Art Director': '美术监督',
  'Chief Animation Director': '总作画监督',
  'Director of Photography': '摄影监督',
  'Color Design': '色彩设计',
  'Mechanical Design': '机械设计',
  '3D Director': '3D监督',
  'Theme Song Performance': '主题歌',
  'Key Animation': '原画',
  Animator: '动画师',
  'Background Art': '背景美术',
  'Special Effects': '特效',
  Script: '剧本',
  Screenplay: '脚本',
  Editor: '剪辑',
  Editing: '剪辑',
  Composer: '作曲',
  Mangaka: '漫画家',
  Storyboard: '分镜',
  'Storyboard Artist': '分镜',
  'Original Character Design': '角色原案',
  'In-Between Animation': '中间帧',
  'Episode Director': '演出',
  'Assistant Director': '副监督',
  'Series Director': '系列监督',
  'CGI Director': 'CGI监督',
  'Voice Director': '音响监督',
  Planning: '企划',
  Layout: '构图',
  Finishing: '上色',
  Photography: '摄影',
  Setting: '设定',
  'Props Design': '道具设计',
  'Action Animation Direction': '动作作画监督',
}

const SEASON_DICT: Record<string, string> = {
  Winter: '冬季',
  Spring: '春季',
  Summer: '夏季',
  Fall: '秋季',
}

export function translateLocal(text: string): string | null {
  if (!text?.trim()) return null
  const lower = text.toLowerCase().trim()
  if (GENRE_DICT[lower]) return GENRE_DICT[lower]
  if (ROLE_DICT[lower]) return ROLE_DICT[lower]
  if (SEASON_DICT[text.trim()]) return SEASON_DICT[text.trim()]
  // 模糊匹配
  for (const [en, cn] of Object.entries(GENRE_DICT)) {
    if (lower.includes(en)) return cn
  }
  return null
}

export function translateStaffRoles(staff: Array<{ role: string; name: string }>) {
  return staff.map((s) => ({ role: translateLocal(s.role) || s.role, name: s.name }))
}
