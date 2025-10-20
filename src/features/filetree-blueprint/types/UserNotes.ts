// src/features/filetree-blueprint/types/UserNotes.ts
// [module: filetree-blueprint] [tags: Types, UserNotes]

/**
 * 用户备注数据模型
 * 
 * 设计原则：
 * 1. 结构化存储：支持多种类型的用户标注
 * 2. 版本化管理：支持历史记录和变更追踪
 * 3. 富内容支持：支持Markdown和标签系统
 * 4. 可扩展性：为未来功能预留扩展空间
 */

/**
 * 优先级枚举
 */
export enum Priority {
    Critical = 'critical',  // 🔴 紧急
    High = 'high',         // 🟠 高
    Medium = 'medium',     // 🟡 中  
    Low = 'low',           // 🟢 低
    None = 'none'          // ⚪ 无
}

/**
 * 标签颜色枚举
 */
export enum TagColor {
    Red = 'red',
    Orange = 'orange', 
    Yellow = 'yellow',
    Green = 'green',
    Blue = 'blue',
    Purple = 'purple',
    Pink = 'pink',
    Gray = 'gray'
}

/**
 * 标签定义
 */
export interface Tag {
    /** 标签名称 */
    name: string;
    /** 标签颜色 */
    color: TagColor;
    /** 创建时间 */
    createdAt: number;
    /** 描述 */
    description?: string;
}

/**
 * 评论/备注条目
 */
export interface Comment {
    /** 唯一ID */
    id: string;
    /** 评论内容（支持Markdown） */
    content: string;
    /** 创建时间 */
    createdAt: number;
    /** 最后修改时间 */
    lastEditedAt?: number;
    /** 是否置顶 */
    pinned?: boolean;
    /** 关联的标签 */
    tags?: string[];
}

/**
 * 待办事项
 */
export interface TodoItem {
    /** 唯一ID */
    id: string;
    /** 待办内容 */
    content: string;
    /** 是否完成 */
    completed: boolean;
    /** 创建时间 */
    createdAt: number;
    /** 完成时间 */
    completedAt?: number;
    /** 优先级 */
    priority?: Priority;
    /** 截止时间 */
    dueDate?: number;
}

/**
 * 链接/关联
 */
export interface Link {
    /** 链接类型 */
    type: 'url' | 'file' | 'line' | 'symbol';
    /** 链接目标 */
    target: string;
    /** 链接标题 */
    title?: string;
    /** 描述 */
    description?: string;
    /** 创建时间 */
    createdAt: number;
}

/**
 * 文件状态
 */
export enum FileStatus {
    Active = 'active',         // 活跃开发中
    Review = 'review',         // 需要Review
    Deprecated = 'deprecated', // 已废弃
    Archive = 'archive',       // 归档
    Testing = 'testing',       // 测试中
    Done = 'done'              // 已完成
}

/**
 * 评分信息
 */
export interface Rating {
    /** 代码质量评分 1-5 */
    codeQuality?: number;
    /** 重要性评分 1-5 */
    importance?: number;
    /** 复杂度评分 1-5 */
    complexity?: number;
    /** 评分时间 */
    ratedAt: number;
    /** 评分备注 */
    note?: string;
}

/**
 * 用户备注主数据结构
 */
export interface UserNotes {
    /** 文件路径 */
    filePath: string;
    
    /** 基础信息 */
    priority: Priority;
    status: FileStatus;
    
    /** 标签系统 */
    tags: Tag[];
    
    /** 评论系统 */
    comments: Comment[];
    
    /** 待办事项 */
    todos: TodoItem[];
    
    /** 外部链接 */
    links: Link[];
    
    /** 评分信息 */
    rating?: Rating;
    
    /** 自定义属性 */
    customFields?: Record<string, any>;
    
    /** 元数据 */
    metadata: {
        /** 创建时间 */
        createdAt: number;
        /** 最后修改时间 */
        lastEditedAt: number;
        /** 修改次数 */
        editCount: number;
        /** 版本号 */
        version: string;
    };
}

/**
 * 用户备注摘要（用于列表显示）
 */
export interface UserNotesSummary {
    filePath: string;
    priority: Priority;
    status: FileStatus;
    tagCount: number;
    commentCount: number;
    todoCount: number;
    completedTodos: number;
    lastEditedAt: number;
    hasRating: boolean;
}

/**
 * 备注搜索过滤器
 */
export interface NotesFilter {
    /** 按标签过滤 */
    tags?: string[];
    /** 按优先级过滤 */
    priorities?: Priority[];
    /** 按状态过滤 */
    statuses?: FileStatus[];
    /** 按内容搜索 */
    searchText?: string;
    /** 按时间范围过滤 */
    dateRange?: {
        start: number;
        end: number;
    };
    /** 按评分过滤 */
    ratingRange?: {
        min: number;
        max: number;
        field: keyof Rating;
    };
}

/**
 * 备注统计信息
 */
export interface NotesStatistics {
    totalFiles: number;
    totalComments: number;
    totalTodos: number;
    completedTodos: number;
    
    byPriority: Record<Priority, number>;
    byStatus: Record<FileStatus, number>;
    byTag: Record<string, number>;
    
    averageRating?: {
        codeQuality: number;
        importance: number;
        complexity: number;
    };
    
    recentActivity: {
        lastWeek: number;
        lastMonth: number;
        lastYear: number;
    };
}

/**
 * 创建空的用户备注
 */
export function createEmptyUserNotes(filePath: string): UserNotes {
    const now = Date.now();
    
    return {
        filePath,
        priority: Priority.None,
        status: FileStatus.Active,
        tags: [],
        comments: [],
        todos: [],
        links: [],
        customFields: {},
        metadata: {
            createdAt: now,
            lastEditedAt: now,
            editCount: 0,
            version: '1.0.0'
        }
    };
}

/**
 * 生成备注摘要
 */
export function generateUserNotesSummary(notes: UserNotes): UserNotesSummary {
    return {
        filePath: notes.filePath,
        priority: notes.priority,
        status: notes.status,
        tagCount: notes.tags.length,
        commentCount: notes.comments.length,
        todoCount: notes.todos.length,
        completedTodos: notes.todos.filter(todo => todo.completed).length,
        lastEditedAt: notes.metadata.lastEditedAt,
        hasRating: !!notes.rating
    };
}

/**
 * 生成唯一ID
 */
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 获取优先级显示信息
 */
export function getPriorityDisplay(priority: Priority): { icon: string; label: string; color: string } {
    switch (priority) {
        case Priority.Critical:
            return { icon: '🔴', label: '紧急', color: '#ff4757' };
        case Priority.High:
            return { icon: '🟠', label: '高', color: '#ff7f50' };
        case Priority.Medium:
            return { icon: '🟡', label: '中', color: '#ffa502' };
        case Priority.Low:
            return { icon: '🟢', label: '低', color: '#7bed9f' };
        case Priority.None:
        default:
            return { icon: '⚪', label: '无', color: '#747d8c' };
    }
}

/**
 * 获取状态显示信息
 */
export function getStatusDisplay(status: FileStatus): { icon: string; label: string; color: string } {
    switch (status) {
        case FileStatus.Active:
            return { icon: '🚀', label: '活跃', color: '#2ed573' };
        case FileStatus.Review:
            return { icon: '👀', label: 'Review', color: '#ffa502' };
        case FileStatus.Deprecated:
            return { icon: '⚠️', label: '废弃', color: '#ff4757' };
        case FileStatus.Archive:
            return { icon: '📦', label: '归档', color: '#747d8c' };
        case FileStatus.Testing:
            return { icon: '🧪', label: '测试', color: '#5352ed' };
        case FileStatus.Done:
            return { icon: '✅', label: '完成', color: '#2ed573' };
        default:
            return { icon: '❓', label: '未知', color: '#747d8c' };
    }
}

/**
 * 获取标签颜色的CSS值
 */
export function getTagColorValue(color: TagColor): string {
    const colorMap: Record<TagColor, string> = {
        [TagColor.Red]: '#ff4757',
        [TagColor.Orange]: '#ffa502',
        [TagColor.Yellow]: '#ffda79',
        [TagColor.Green]: '#7bed9f',
        [TagColor.Blue]: '#70a1ff',
        [TagColor.Purple]: '#5352ed',
        [TagColor.Pink]: '#ff6b81',
        [TagColor.Gray]: '#747d8c'
    };
    
    return colorMap[color] || colorMap[TagColor.Gray];
}