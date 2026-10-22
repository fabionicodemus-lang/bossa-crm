// A liberação do site público nunca libera a indexação de uma prévia da Vercel.
export const indexacaoPermitida =
  process.env.BOSSA_PUBLICADO === "sim" && process.env.VERCEL_ENV !== "preview";
