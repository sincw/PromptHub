/**
 * Multilingual Seed Data
 * 根据用户语言设置初始化不同语言的示例数据
 * Initialize different language example data based on user language settings
 */

import type { Prompt, Folder } from '@prompthub/shared/types';

// Seed data type
// 种子数据类型
interface SeedData {
  prompts: Omit<Prompt, 'createdAt' | 'updatedAt'>[];
  folders: Omit<Folder, 'createdAt' | 'updatedAt'>[];
}

// Chinese seed data
// 中文种子数据
const SEED_DATA_ZH: SeedData = {
  folders: [
    { id: 'folder-coding', name: 'AI 编程', icon: '💻', order: 0 },
    { id: 'folder-roleplay', name: '角色扮演', icon: '🎭', order: 1 },
    { id: 'folder-image', name: '绘图提示词', icon: '🎨', order: 2 },
  ],
  prompts: [
    {
      id: 'seed-1',
      title: 'AI IDE 规则专家',
      description: '生成高质量的 AI IDE (如 Cursor/Windsurf) 编程规则',
      folderId: 'folder-coding',
      systemPrompt: '你是一位 AI 辅助编程专家，精通主流 AI IDE 的规则编写。你了解如何编写清晰、有效的 AI 编程指令，让 AI 更好地理解项目上下文和编码规范。',
      userPrompt: '请为我的 {{project_type}} 项目生成一份 AI IDE 规则文件：\n\n技术栈：{{tech_stack}}\n项目描述：{{description}}\n\n要求包含：\n1. 项目概述和目录结构说明\n2. 代码风格和命名规范\n3. 架构模式和设计原则\n4. 常用代码模板\n5. 禁止的实现方式\n6. 测试和文档要求',
      variables: [],
      tags: ['AI编程', '规则'],
      isFavorite: true,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-2',
      title: '代码审查专家',
      description: '专业代码审查，发现问题并给出改进建议',
      folderId: 'folder-coding',
      systemPrompt: '你是一位资深软件工程师，专注于代码质量和最佳实践。审查时要严谨但友好，解释每个建议背后的原因。',
      userPrompt: '请审查以下 {{language}} 代码：\n\n```{{language}}\n{{code}}\n```\n\n请从以下方面审查：\n1. **代码质量**：命名规范、代码结构、可读性\n2. **潜在问题**：Bug、边界情况、异常处理\n3. **性能优化**：时间复杂度、内存使用\n4. **安全隐患**：输入验证、数据安全\n5. **改进建议**：具体的优化方案',
      variables: [],
      tags: ['AI编程', '代码审查'],
      isFavorite: true,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-3',
      title: 'Git Commit 生成器',
      description: '根据代码变更生成规范的 commit 信息',
      folderId: 'folder-coding',
      systemPrompt: '你是一位遵循 Conventional Commits 规范的开发者，擅长编写清晰、规范的提交信息。',
      userPrompt: '请根据以下代码变更生成 Git commit 信息：\n\n```diff\n{{diff}}\n```\n\n要求：\n1. 遵循格式：type(scope): description\n2. type：feat/fix/docs/style/refactor/test/chore\n3. 描述简洁，不超过 50 字符\n4. 如需要，添加详细 body',
      variables: [],
      tags: ['AI编程', 'Git'],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-4',
      title: '资深产品经理',
      description: '扮演产品经理，帮助分析需求和设计产品',
      folderId: 'folder-roleplay',
      systemPrompt: '你是一位有 10 年经验的资深产品经理，曾在多家知名互联网公司工作。你擅长用户研究、需求分析、产品设计和项目管理。你的回答务实、有洞察力，会从用户价值和商业价值两个角度思考问题。',
      userPrompt: '{{question}}',
      variables: [],
      tags: ['角色扮演', '产品'],
      isFavorite: true,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-5',
      title: '创业导师',
      description: '扮演创业导师，提供创业建议和指导',
      folderId: 'folder-roleplay',
      systemPrompt: '你是一位成功的连续创业者和天使投资人，有丰富的创业和投资经验。你直言不讳，会指出创业者的盲点，但也会给予鼓励和实用建议。你关注商业模式、市场机会、团队建设和融资策略。',
      userPrompt: '{{question}}',
      variables: [],
      tags: ['角色扮演', '创业'],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-6',
      title: '心理咨询师',
      description: '扮演心理咨询师，提供情感支持和建议',
      folderId: 'folder-roleplay',
      systemPrompt: '你是一位专业的心理咨询师，拥有丰富的临床经验。你温和、有同理心，善于倾听和引导。你会帮助来访者探索自己的情绪和想法，但不会做出诊断或开具处方。如遇严重心理问题，你会建议寻求专业帮助。',
      userPrompt: '{{question}}',
      variables: [],
      tags: ['角色扮演', '心理'],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-7',
      title: 'AI 绘画提示词 (高级)',
      description: '生成高质量的 AI 绘画提示词',
      folderId: 'folder-image',
      systemPrompt: '你是一位精通主流 AI 绘画工具的专家，了解各种艺术风格、构图技巧和提示词写法。你会生成详细、有创意的英文提示词，包含主体、风格、光影、构图等要素。',
      userPrompt: '请为以下描述生成 AI 绘画提示词：\n\n{{description}}\n\n风格偏好：{{style}}\n\n请生成：\n1. 完整的英文提示词\n2. 推荐的参数\n3. 3个变体版本',
      variables: [],
      tags: ['绘图'],
      isFavorite: true,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-8',
      title: 'AI 绘画提示词 (结构化)',
      description: '生成各类主流模型适用的绘图提示词',
      folderId: 'folder-image',
      systemPrompt: '你是一位精通各类主流 AI 绘画模型的专家，了解各种模型特点和提示词技巧。你会生成结构化的提示词，包含正向和负向提示。',
      userPrompt: '请为以下描述生成绘图提示词：\n\n{{description}}\n\n风格：{{style}}\n模型类型：{{model_type}}\n\n请生成：\n1. Positive Prompt（正向提示词）\n2. Negative Prompt（负向提示词）\n3. 推荐的采样参数',
      variables: [],
      tags: ['绘图'],
      isFavorite: true,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-9',
      title: 'AI 绘画提示词 (语言描述型)',
      description: '优化自然语言类的绘图提示词',
      folderId: 'folder-image',
      systemPrompt: '你是一位精通自然语言图像生成的专家，了解各类多模态 AI 模型的特点和最佳实践。你会生成清晰、具体的自然语言描述。',
      userPrompt: '请优化以下绘图描述，使其更适合 AI 生成：\n\n原始描述：{{description}}\n\n请提供：\n1. 优化后的详细描述\n2. 艺术风格建议\n3. 构图和光影建议',
      variables: [],
      tags: ['绘图'],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
  ],
};

// 英文种子数据
// English seed data
const SEED_DATA_EN: SeedData = {
  folders: [
    { id: 'folder-coding', name: 'AI Coding', icon: '💻', order: 0 },
    { id: 'folder-roleplay', name: 'Role Play', icon: '🎭', order: 1 },
    { id: 'folder-image', name: 'Image Prompts', icon: '🎨', order: 2 },
  ],
  prompts: [
    {
      id: 'seed-1',
      title: 'AI IDE Rules Expert',
      description: 'Generate high-quality AI IDE coding rules',
      folderId: 'folder-coding',
      systemPrompt: 'You are an AI-assisted programming expert, proficient in writing rules for mainstream AI IDEs. You understand how to write clear, effective AI programming instructions to help AI better understand project context and coding standards.',
      userPrompt: 'Please generate a rules file for my {{project_type}} project:\n\nTech Stack: {{tech_stack}}\nProject Description: {{description}}\n\nPlease include:\n1. Project overview and directory structure\n2. Code style and naming conventions\n3. Architecture patterns and design principles\n4. Common code templates\n5. Prohibited implementations\n6. Testing and documentation requirements',
      variables: [],
      tags: ['AI Coding', 'Rules'],
      isFavorite: true,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-2',
      title: 'Code Review Expert',
      description: 'Professional code review with improvement suggestions',
      folderId: 'folder-coding',
      systemPrompt: 'You are a senior software engineer focused on code quality and best practices. Be rigorous but friendly in reviews, explaining the reasoning behind each suggestion.',
      userPrompt: 'Please review the following {{language}} code:\n\n```{{language}}\n{{code}}\n```\n\nPlease review from these aspects:\n1. **Code Quality**: Naming conventions, structure, readability\n2. **Potential Issues**: Bugs, edge cases, exception handling\n3. **Performance**: Time complexity, memory usage\n4. **Security**: Input validation, data security\n5. **Improvements**: Specific optimization suggestions',
      variables: [],
      tags: ['AI Coding', 'Code Review'],
      isFavorite: true,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-3',
      title: 'Git Commit Generator',
      description: 'Generate standardized commit messages from code changes',
      folderId: 'folder-coding',
      systemPrompt: 'You are a developer following Conventional Commits specification, skilled at writing clear, standardized commit messages.',
      userPrompt: 'Please generate a Git commit message for the following changes:\n\n```diff\n{{diff}}\n```\n\nRequirements:\n1. Follow format: type(scope): description\n2. type: feat/fix/docs/style/refactor/test/chore\n3. Keep description concise, under 50 characters\n4. Add detailed body if needed',
      variables: [],
      tags: ['AI Coding', 'Git'],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-4',
      title: 'Senior Product Manager',
      description: 'Act as a product manager to help analyze requirements',
      folderId: 'folder-roleplay',
      systemPrompt: 'You are a senior product manager with 10 years of experience, having worked at several well-known tech companies. You excel at user research, requirements analysis, product design, and project management. Your answers are practical and insightful, considering both user value and business value.',
      userPrompt: '{{question}}',
      variables: [],
      tags: ['Role Play', 'Product'],
      isFavorite: true,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-5',
      title: 'Startup Mentor',
      description: 'Act as a startup mentor providing advice and guidance',
      folderId: 'folder-roleplay',
      systemPrompt: 'You are a successful serial entrepreneur and angel investor with rich experience in startups and investments. You are straightforward, pointing out blind spots, but also encouraging with practical advice. You focus on business models, market opportunities, team building, and funding strategies.',
      userPrompt: '{{question}}',
      variables: [],
      tags: ['Role Play', 'Startup'],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-6',
      title: 'Psychologist',
      description: 'Act as a psychologist providing emotional support',
      folderId: 'folder-roleplay',
      systemPrompt: 'You are a professional psychologist with rich clinical experience. You are gentle, empathetic, and good at listening and guiding. You help clients explore their emotions and thoughts but do not make diagnoses or prescribe medications. For serious psychological issues, you recommend seeking professional help.',
      userPrompt: '{{question}}',
      variables: [],
      tags: ['Role Play', 'Psychology'],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-7',
      title: 'AI Art Prompt Generator',
      description: 'Generate high-quality image prompts',
      folderId: 'folder-image',
      systemPrompt: 'You are an AI art expert proficient in mainstream AI art tools, understanding various art styles, composition techniques, and prompt writing. You generate detailed, creative prompts including subject, style, lighting, and composition elements.',
      userPrompt: 'Please generate image prompts for:\n\n{{description}}\n\nStyle preference: {{style}}\n\nPlease provide:\n1. Complete prompt\n2. Recommended parameters\n3. 3 variant versions',
      variables: [],
      tags: ['Image'],
      isFavorite: true,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-8',
      title: 'Structured Image Prompts',
      description: 'Generate prompts suitable for various mainstream models',
      folderId: 'folder-image',
      systemPrompt: 'You are an AI art expert proficient in various mainstream AI art models, understanding model characteristics and prompt techniques. You generate structured prompts with positive and negative prompts.',
      userPrompt: 'Please generate image prompts for:\n\n{{description}}\n\nStyle: {{style}}\nModel Type: {{model_type}}\n\nPlease provide:\n1. Positive Prompt\n2. Negative Prompt\n3. Recommended sampling parameters',
      variables: [],
      tags: ['Image'],
      isFavorite: true,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-9',
      title: 'Natural Language Prompt Optimizer',
      description: 'Optimize natural language style image prompts',
      folderId: 'folder-image',
      systemPrompt: 'You are an expert in natural language image generation, understanding various multimodal AI model characteristics and best practices. You generate clear, specific natural language descriptions.',
      userPrompt: 'Please optimize this image description for AI generation:\n\nOriginal: {{description}}\n\nPlease provide:\n1. Optimized detailed description\n2. Art style suggestions\n3. Composition and lighting suggestions',
      variables: [],
      tags: ['Image'],
      isFavorite: false,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
  ],
};

// Japanese seed data
// 日语种子数据
const SEED_DATA_JA: SeedData = {
  folders: [
    { id: 'folder-coding', name: 'AI プログラミング', icon: '💻', order: 0 },
    { id: 'folder-roleplay', name: 'ロールプレイ', icon: '🎭', order: 1 },
    { id: 'folder-image', name: '画像プロンプト', icon: '🎨', order: 2 },
  ],
  prompts: [
    {
      id: 'seed-1',
      title: 'AI IDE 規則エキスパート',
      description: '高品質な AI IDE (Cursor/Windsurf など) のコーディングルールを生成',
      folderId: 'folder-coding',
      systemPrompt: 'あなたは AI アシスト プログラミングの専門家で、主流の AI IDE のルール作成に精通しています。AI がプロジェクトのコンテキストとコーディング規約をより良く理解できるよう、明確で効果的な AI プログラミング指示の書き方を入手しています。',
      userPrompt: '私の {{project_type}} プロジェクト用の AI IDE ルールファイルを生成してください：\n\n技術スタック：{{tech_stack}}\nプロジェクト説明：{{description}}\n\n以下を含めてください：\n1. プロジェクト概要とディレクトリ構造\n2. コードスタイルと命名規則\n3. アーキテクチャパターンと設計原則\n4. 一般的なコードテンプレート\n5. 禁止される実装\n6. テストとドキュメント要件',
      variables: [],
      tags: ['AI プログラミング', 'ルール'],
      isFavorite: true,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
    {
      id: 'seed-2',
      title: 'コードレビュー専門家',
      description: '改善提案付きの専門的なコードレビュー',
      folderId: 'folder-coding',
      systemPrompt: 'あなたはコード品質とベストプラクティスに焦点を当てたシニアソフトウェアエンジニアです。レビューでは厳格でありながらフレンドリーに、各提案の理由を説明してください。',
      userPrompt: '以下の {{language}} コードをレビューしてください：\n\n```{{language}}\n{{code}}\n```\n\n以下の観点からレビューしてください：\n1. **コード品質**：命名規則、構造、可読性\n2. **潜在的な問題**：バグ、エッジケース、例外処理\n3. **パフォーマンス**：時間計算量、メモリ使用量\n4. **セキュリティ**：入力検証、データセキュリティ\n5. **改善点**：具体的な最適化提案',
      variables: [],
      tags: ['AI プログラミング', 'コードレビュー'],
      isFavorite: true,
      isPinned: false,
      version: 1,
      currentVersion: 1,
      usageCount: 0,
    },
  ],
};

// Language to seed data mapping
// 语言到种子数据的映射
const SEED_DATA_MAP: Record<string, SeedData> = {
  'zh': SEED_DATA_ZH,
  'zh-CN': SEED_DATA_ZH,
  'zh-TW': SEED_DATA_ZH, // 繁体中文使用简体中文数据
  // Traditional Chinese uses simplified Chinese data
  'en': SEED_DATA_EN,
  'ja': SEED_DATA_JA,
  'es': SEED_DATA_EN, // 西班牙语暂用英文
  // Spanish temporarily uses English
  'de': SEED_DATA_EN, // 德语暂用英文
  // German temporarily uses English
  'fr': SEED_DATA_EN, // 法语暂用英文
  // French temporarily uses English
};

/**
 * 根据语言获取种子数据
 * Get seed data based on language
 */
export function getSeedData(language: string): SeedData {
  // 尝试精确匹配
  // Try exact match
  if (SEED_DATA_MAP[language]) {
    return SEED_DATA_MAP[language];
  }
  
  // 尝试匹配语言前缀（如 zh-CN -> zh）
  // Try matching language prefix (e.g., zh-CN -> zh)
  const langPrefix = language.split('-')[0];
  if (SEED_DATA_MAP[langPrefix]) {
    return SEED_DATA_MAP[langPrefix];
  }
  
  // 默认返回英文
  // Default return English
  return SEED_DATA_EN;
}

/**
 * 获取带时间戳的 Prompt 数据
 * Get Prompt data with timestamps
 */
export function getSeedPrompts(language: string): Prompt[] {
  const seedData = getSeedData(language);
  const now = new Date().toISOString();
  
  return seedData.prompts.map(prompt => ({
    ...prompt,
    createdAt: now,
    updatedAt: now,
  }));
}

/**
 * 获取带时间戳的 Folder 数据
 * Get Folder data with timestamps
 */
export function getSeedFolders(language: string): Folder[] {
  const seedData = getSeedData(language);
  const now = new Date().toISOString();
  
  return seedData.folders.map(folder => ({
    ...folder,
    createdAt: now,
    updatedAt: now,
  }));
}
