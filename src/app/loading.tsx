import styles from "./loading.module.css";

/**
 * 全站通用加载骨架。
 *
 * 页面都读取 D1，属于动态渲染，浏览器必须等服务器返回才能切换页面。
 * 这里提供立即可见的加载状态，同时让 Next 能预取该 loading 边界，点击链接后不再出现“无反应”的空档。
 */
export default function Loading() {
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
