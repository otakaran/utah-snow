// Vite/Vitest `?raw` imports (tests read migrations/*.sql?raw).
declare module '*?raw' {
  const content: string;
  export default content;
}
