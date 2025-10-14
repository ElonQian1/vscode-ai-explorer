// src/core/di/Container.ts
// [module: core] [tags: DI, IoC, Container, Singleton]
/**
 * 依赖注入容器
 * 管理服务的注册、实例化和生命周期
 */

type ServiceFactory<T = any> = () => T;
type ServiceInstance<T = any> = T;

export class DIContainer {
    private services = new Map<string, ServiceFactory>();
    private singletons = new Map<string, ServiceInstance>();
    private instances = new Map<string, ServiceInstance>();

    /**
     * 注册单例服务
     */
    registerSingleton<T>(key: string, factory: ServiceFactory<T>): void {
        this.services.set(key, factory);
        this.singletons.set(key, null); // 标记为单例
    }

    /**
     * 注册临时服务（每次获取都创建新实例）
     */
    registerTransient<T>(key: string, factory: ServiceFactory<T>): void {
        this.services.set(key, factory);
    }

    /**
     * 注册实例
     */
    registerInstance<T>(key: string, instance: T): void {
        this.instances.set(key, instance);
    }

    /**
     * 获取服务实例
     */
    get<T>(key: string): T {
        // 优先返回已注册的实例
        if (this.instances.has(key)) {
            return this.instances.get(key) as T;
        }

        // 检查是否为单例
        if (this.singletons.has(key)) {
            let instance = this.singletons.get(key);
            if (!instance) {
                const factory = this.services.get(key);
                if (!factory) {
                    throw new Error(`Service '${key}' not registered`);
                }
                instance = factory();
                this.singletons.set(key, instance);
            }
            return instance as T;
        }

        // 创建临时实例
        const factory = this.services.get(key);
        if (!factory) {
            throw new Error(`Service '${key}' not registered`);
        }
        return factory() as T;
    }

    /**
     * 检查服务是否已注册
     */
    has(key: string): boolean {
        return this.services.has(key) || this.instances.has(key);
    }

    /**
     * 清理容器
     */
    dispose(): void {
        this.services.clear();
        this.singletons.clear();
        this.instances.clear();
    }
}