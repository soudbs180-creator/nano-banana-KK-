export interface PromptLibraryItem {
    id: string;
    title: string;
    category: 'banana-pro' | 'banana' | 'general';
    source?: string;
    prompt: string;
}

export const BUILTIN_PROMPT_LIBRARY: PromptLibraryItem[] = [
    {
        id: 'nbp_flyer_ukiyoe_v2',
        title: '浮世绘闪卡 (Pro)',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【核心指令】 一张日式浮世绘风格的收藏级集换式卡牌设计，竖构图。插画风格模仿《鬼灭之刃》视觉美学：粗细变化的墨笔轮廓线、传统木版画配色、戏剧性动态构图。\n\n【主体描述】 角色：{角色名字}（称号：{柱名/称号}），处于动态战斗姿势，手持 {武器描述}。正在施展 {呼吸法招式名称}，周围环绕着 {视觉特效描述}（例如：巨大的火焰/水龙/旋风），以传统日式水墨画（Sumi-e）风格呈现。\n\n【细节与边框】 背景融合纹理化镭射闪卡（Holographic Foil）效果。四周加入装饰性边框（如青海波纹）。底部有风格化横幅，写着“{日文名字}”。'
    },
    {
        id: 'nbp_clones_room',
        title: '分身术：百变剧场',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【场景描述】 基于上传的参考角色，在同一室内空间（如：东京公寓/赛博实验室）生成约三十个相同的角色。要求透视准确、遮挡关系自然、光线统一。\n\n【空间布局】 包含强烈的景深：\n- 前景：由于靠近镜头产生的动态模糊或部分遮挡（如穿过镜头、在植物后窥视）。\n- 中景：主要活动区。角色正在进行各种日常互动（如整理、查看手机、在镜子前、阅读）。\n- 背景：靠近门口或走廊，角色细小且带透视衰减。\n\n【风格融合】 将人物置于与插画姿势匹配的实景背景中，运用逼真的光效和景深，使插画感与真实环境无缝衔接。'
    },
    {
        id: 'nbp_fashion_explode',
        title: '时尚穿搭分解图',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【构图】 手绘风格的时尚概念分解图。中心为一位时尚自信女性角色的全身像，姿态自然。\n\n【结构化要素】 周围环绕关键元素的分解模块：\n- 服装层次：展示外套、内衣、配饰及其细节放大。\n- 表情包：展示 3-4 种动态面部表情。\n- 特写：展示面料褶皱、手势与肌肤质感。\n- 随身物：一个打开的包，展示口红、香水、日记本等物品。\n- 指示线：手写风格标注（如“柔滑面料”、“色号#FF0000”）。\n\n【背景】 柔和的米色羊皮纸纹理草图背景，4K 清晰度，兼具时尚感与设计感。'
    },
    {
        id: 'nbp_crystal_macro',
        title: '水晶/透明材质建模',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【主体】 以清澈、抛光度极高的透明水晶/玻璃材质渲染 [一台相机/一件艺术品]。机身具有明显的厚度与立体深度，几何结构精确，无需图案即可辨认造型。\n\n【光影表现】 重点突出折射与镜面反射。倒角边缘呈现锐利高光。光线穿透材质内部产生微妙的弯曲与局部失真效果。底部有柔和漫散的阴影。\n\n【整体风格】 极简现代的精品摄影风格。高调光感，背景干净虚化。整体视觉极度剔透奢华。'
    },
    {
        id: 'nbp_cyber_card',
        title: '赛博全息名片',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【主视图】 逼真的赛博朋克时尚大片感：左手拿一张横向亚克力无边框名片，几乎占据整个画面。名片边缘圆润，散发出霓虹微光（蓝/粉/紫渐变）。\n\n【排版布局】 名片表面文字如同精细雕刻的全息投影。背景深色虚化，握住名片的指尖反射出电影感光影。\n\n【字段信息】 包含：\n- 姓名：[填写姓名]\n- 职位：[填写职位]\n- 社交联系方式（带图标）\n\n【视觉效果】 线条简洁，富有未来科技感，适合专业展示。'
    },
    {
        id: 'nbp_isometric_cube_room',
        title: '3D等距立方体房间',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【构图】 一个等距 3D 立体切面房间，所有物品严格包含在立方体内，四分之三偏上方视角。房间主题：[主题描述]。\n\n【人物与材质】 房间内放置 Q 版手办风格人物，正在进行 [活动描述]。人物呈现哑光 PVC 材质感，表情生动。背景为纯净的中性底，反射与投影细节丰富。\n\n【光照】 氛围光：[如：暖午后光/梦幻极光]，光影带有鲜明的颜色倾向，对比度明快。'
    },
    {
        id: 'nbp_city_kaiju',
        title: '城市巨兽（摄影+插画混合）',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【底图】 使用上传的城市照片。保持建筑、街道、人物的真实性。\n\n【创意叠加】 在天空中添加一个巨大的扁平化插画生物，正俯瞰城市。生物轮廓清晰，使用霓虹色调（如：柔和绿/橙）。\n\n【融合规则】 生物部分隐没在建筑物边缘后方，形成准确的遮挡关系。在建筑物上留有极其微妙的生物反射光影或投影。营造一种真实世界与现代插画无缝融合的超现实美感。'
    },
    {
        id: 'nbp_doc_to_flow_v2',
        title: '专业文档转流程图',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【指令】 根据我上传的文档内容，提取核心逻辑并生成专业且直观的流程图海报。\n\n【结构】 包含标题区、主流程链路、异常判断分支、侧边图例说明。要求节点间距均匀，箭头动线清晰。字体可读，层级分明。\n\n【配色】 采用结构化配色方案，主体色统一，逻辑节点差异化显示。风格建议：简洁信息图风格。'
    },
    {
        id: 'nb_character_sheet_pro',
        title: '全方位角色设定集',
        category: 'banana',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【指令】 为我生成一份完整的角色设计手册（Character Design Sheet）。\n\n【内容模块】\n- 比例设定：不同身高对比图，标准头身比参考。\n- 三视图：正、侧、背面全身立绘。\n- 表情包：3-5 种核心情绪（喜、怒、哀、乐）。\n- 动作页：各种代表性的动态姿势（Pose Sheet）。\n- 服装及配件：细节差分展示。保持角色在所有视角下的特征（如：发色、瞳孔、饰品）高度一致。'
    },
    {
        id: 'nb_gunpla_box_art',
        title: '高达/手办模型包装盒',
        category: 'banana',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【构图】 将参考图角色转化为 Gunpla 高达模型或角色手办的包装盒展示类风格。采用等距透视。\n\n【包装元素】 模型外包装盒设计：包含品牌标题“ZENITH”、技术参数插图、序列号、风格化字体说明。背景类似官方宣传渲染图，干净利落。\n\n【主体显示】 盒子旁边展示组装完成的模型本体，辅以未来感十足的机械配件或特效件。光影呈现商业摄影级的精致渲染感。'
    },
    {
        id: 'nb_sticker_outline',
        title: '俏皮轮廓提示词贴纸',
        category: 'banana',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【指令】 将上传的人物/物体转化为具有白色粗轮廓的贴纸风格。画面采用清新、扁平的网页插图画风（Vector Style）。\n\n【排版】 在主体周围或下方加入一小段俏皮的手写体英文/中文短语。整体色彩明亮，适合直接在设计稿中使用。'
    },
    {
        id: 'nb_old_photo_restore',
        title: '老照片高清修复',
        category: 'banana',
        prompt: '对上传的旧照片进行 AI 级修复与自然着色：清除噪点、折痕与斑点；增强面部细节与清晰度。着色需克制自然，还原历史感。不改变原始构图，最终输出极高分辨率。'
    },
    {
        id: 'general_cinematic_portrait',
        title: '电影级胶片人像',
        category: 'general',
        prompt: '极致细节的 8K 电影感人像摄影。光影采用侧逆光营造轮廓感，呈现真实的皮肤纹理（毛孔、细微瑕疵）。使用 85mm 镜头，F1.8 大光圈虚化背景。色彩带有柯达胶片（Kodak Portra）的温暖质感与颗粒感。背景是具有叙事感的[街道/室内]场景。'
    },
    {
        id: 'nbp_crystal_v2',
        title: '水晶质感 (例13-Pro)',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【用法引导】 在提示词中的 [ ] 内输入想要生成的物品名称（如：一个苹果、一台相机）。配合参考图效果更佳。\n\n【核心指令】 一幅照片级真实、细节高度丰富的图像。主体是 [物品名称]，以清澈、抛光度极高的透明玻璃或水晶材质渲染而成。机身具有明显的厚度与立体深度，几何结构呈现精确，使其无需任何图案就能一眼辨认。所有边缘采用圆润倒角与光滑曲面处理，在光线下产生优雅的折射效果。物品略微倾斜摆放，仿佛漂浮在洁净无暇、无缝衔接的淡米白背景上方。'
    },
    {
        id: 'nbp_chongqi_v2',
        title: '充气玩具风格 (例14-Pro)',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【用法引导】 必须上传一张参考图片（如 Logo 或特定造型）。\n\n【核心指令】 将附件中的标志/物体制作成一个高分辨率的3D渲染图，形状应为充气蓬松的物体。呈现柔软饱满的效果，如同毛绒气球。使用光滑的哑光纹理，并添加细微的织物褶皱和缝线，以突出充气效果。物体应略带弹性，并辅以柔和的阴影和光线，以增强体积感和真实感。放置在简洁的浅灰色背景上。'
    },
    {
        id: 'nbp_isometric_sketch',
        title: '手绘等距示意图 (例15-Pro)',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【用法引导】 必须上传一张场景/实景照片。用于生成该场景的专业等距透视手绘草图。\n\n【核心指令】 绘制上传图像所示区域的手绘等距示意图。使用专业建筑草图线条，展现精确的透视关系。配色采用简洁的线稿加局部色块填充风格，具有高度的视觉引导性和说明性。适合用于规划展示。'
    },
    {
        id: 'nbp_behind_scenes',
        title: '摄影幕后揭秘 (例16-Pro)',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【用法引导】 上传一张你认为不可思议的照片。用于探索它是如何被“拍摄”出来的场景。\n\n【核心指令】 我想看看这张照片拍摄的幕后花絮（Behind the scenes），了解它是如何诞生的。展示拍摄现场的灯光布局、相机机位、反光板、以及正在操作的摄影师。画面应真实展示拍摄现场的杂乱与专业，与最终成片的精致形成对比。'
    },
    {
        id: 'nbp_age_scan',
        title: '面部分析与年龄估算 (例17-Pro)',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【用法引导】 上传一张人物正面清晰肖像。用于生成带面部分析网格的信息图。\n\n【核心指令】 根据参考图制作一张超逼真、高分辨率的肖像信息图。保持人物身份不变，使用中性摄影棚背景。在整张脸上叠加一个微妙的半透明蓝色面部分析网格。在图像侧边生成类似 UI 的数据面板，显示面部骨骼结构、对称性指标。在图像底部中央，用粗体大字显示最终估计真实年龄，例如：“估计年龄：{30}”。'
    },
    {
        id: 'nbp_sleep_poster',
        title: '睡眠报告微型景观 (例52-Pro)',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【用法引导】 上传一张 Apple Watch 或睡眠软件的健康数据截图。\n\n【任务指令】 分析截图中的清醒、REM、核心、深睡四个阶段时长。生成一张可爱的睡眠报告海报。主体是一个立体的、垂直长方体透明玻璃容器，内部由四种不同颜色的微缩景观（如：云朵、森林、海洋、矿井）按比例层层堆叠。顶部边缘坐着一个Q版 3D 小人，背景柔和梦幻。'
    },
    {
        id: 'nb_vtuber_room',
        title: '照片转 Vtuber 直播间 (例90)',
        category: 'banana',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【用法引导】 上传一张你想要转换为虚拟角色的人物照片。\n\n【指令】 使用原图创建一个虚拟的Vtuber及其直播画面。Vtuber的发型和服装将忠实还原原图。画面为2.5D画质。采用经典的直播排版：人物上半身放置在屏幕右下方，正在游玩的游戏直播画面放置在屏幕中央，聊天弹幕画面放置在左侧。整体风格可爱且专业。'
    },
    {
        id: 'nb_line_stamps',
        title: '角色表情包/印章 (例108)',
        category: 'banana',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【用法引导】 在提示词中描述角色，或上传一张角色参考图。\n\n【指令】 生成一份角色设计表情包（Line Stickers/Stamp）。包含：角色中心位及多个小表情。表情涵盖：喜悦、愤怒、悲伤、快乐。使用粗黑色轮廓线，对比鲜明的填充色，具有极高的社交媒介应用感。背景透明。'
    },
    {
        id: 'nb_pixar_3d',
        title: '真人转 PIXAR 3D 头像 (例110)',
        category: 'banana',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【用法引导】 上传人物照片，将其 3D 萌化为皮克斯动画风格。\n\n【指令】 生成一幅 3D 动画头像。对象为上传图像中的人物，面带灿烂笑容。风格：Pixar/Disney 精良动画风格。特质：高质量渲染、极细的大眼比例、光滑的肌肤纹理、温暖大气的侧光源。背景为纯白色。'
    },
    {
        id: 'nb_lego_v3',
        title: '高仿乐高包装盒 (V3)',
        category: 'banana',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【核心构图】 将参考图角色/建筑转化为乐高（LEGO）套装包装盒展示。采用等距 45 度视角。\n\n【细节元素】 画面中心是一个精美的纸盒包装，左上角有黄色乐高标志，右侧标有年龄建议（如 18+）和零件总数。盒子上印有模型搭建完成后的宣传大片。包装盒旁边摆放着几颗真实比例的散乱乐高积木块。'
    },
    {
        id: 'nbp_json_style',
        title: 'JSON 结构化样式定义 (例42-Pro)',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【用法引导】 在提示词下方的 [ ] 中修改你想要的视觉元素。这种结构化描述能让模型极其精准地执行指令。\n\n【核心指令】 采用 JSON 模式定义画面样式：\n{\n  "style": "vertical_slice_glitch",\n  "subject": "[一个穿着和服的赛博女性角色]",\n  "composition": "minimalist_centered",\n  "distortion_effects": ["digital_artifacting", "pixel_displacement", "scan_lines"],\n  "background_color": "#000000",\n  "lighting": "intense_rim_light"\n}\n根据此结构渲染出一幅具有故障艺术美感的高分辨率图像，确保所有字段指定的视觉特征得到完美体现。'
    },
    {
        id: 'nbp_digital_twin',
        title: '卫星图转数字孪生 (例48-Pro)',
        category: 'banana-pro',
        source: 'Awesome-Nano-Banana-images',
        prompt: '【用法引导】 最好上传一张卫星图或城市俯拍照片作为参考图。\n\n【核心指令】 你是一位地理空间现实架构师。任务：将上传的卫星图/俯拍图转换为等距 3D 的“数字孪生”模型视图。在图像上叠加半透明的动态地形分析等高线、交通动线箭头、以及发光的建筑边界框。风格应呈现高科技决策大屏的视觉质感，色彩以深蓝和亮橙为主。'
    },
    {
        id: 'general_concept_prop',
        title: '游戏/影视道具概念设计',
        category: 'general',
        prompt: '单件道具模型设计，展示 [武器/古董/高科技装置]。包含主视角及其侧面透视。强调材质表现（如：磨损的皮革、氧化的金属、发光的能源核心）。背景为深灰色极简设计室风格。包含比例参考线，细节极致。'
    }
];
