import styles from "./page-skeleton.module.css";

/**
 * 通用加载骨架，供各路由段的 loading.tsx 复用。
 *
 * 页面都读取 D1，属于动态渲染，浏览器必须等服务器返回才能切换页面；
 * 该骨架既是导航时的即时反馈，也是 Next 可以预取的 loading 边界。
 */
export function PageSkeleton() {
  return (
    <div className="page" role="status" aria-busy="true">
      <span className="sr-only">正在加载</span>
      <div className="page-heading">
        <div>
          <span className={`${styles.bar} ${styles.eyebrow}`} />
          <span className={`${styles.bar} ${styles.title}`} />
        </div>
        <span className={`${styles.bar} ${styles.action}`} />
      </div>
      <div className="summary-grid">
        {[0, 1, 2].map((index) => (
          <div className="summary-block" key={index}>
            <div className={styles.stack}>
              <span className={`${styles.bar} ${styles.label}`} />
              <span className={`${styles.bar} ${styles.value}`} />
            </div>
          </div>
        ))}
      </div>
      <section className="section-block">
        <span className={`${styles.bar} ${styles.heading}`} />
        <div className={styles.rows}>
          {[0, 1, 2, 3, 4, 5].map((index) => <span className={`${styles.bar} ${styles.row}`} key={index} />)}
        </div>
      </section>
      <section className="section-block">
        <span className={`${styles.bar} ${styles.heading}`} />
        <div className={styles.grid}>
          {[0, 1, 2, 3, 4, 5, 6, 7].map((index) => <span className={`${styles.bar} ${styles.cell}`} key={index} />)}
        </div>
      </section>
    </div>
  );
}
