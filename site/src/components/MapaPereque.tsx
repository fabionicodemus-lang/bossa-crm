import styles from "./MapaPereque.module.css";

const mapa = "/mapa-pereque/index.html";

export function MapaPereque() {
  return (
    <section className={styles.mapa} aria-label="Mapa 3D do Perequê">
      <header className={styles.cabecalho}>
        <div>
          <h3>Explore o Perequê em 3D</h3>
          <p>Encontre o Flow e o Alma, conheça as atrações do bairro e veja as propostas do masterplan.</p>
        </div>
        <a href={mapa} target="_blank" rel="noopener">Abrir mapa em nova aba <span aria-hidden="true">↗</span></a>
      </header>
      <iframe src={mapa} title="Mapa interativo do Perequê com Flow Aptos e Alma Seahouses" loading="lazy" allowFullScreen />
    </section>
  );
}
