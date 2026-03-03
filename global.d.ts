declare module '*?raw' {
  const content: string;
  export default content;
}

declare module '*?url' {
  const content: string;
  export default content;
}

declare module '*.html' {
  const content: string;
  export default content;
}

declare module '*.md' {
  const content: string;
  export default content;
}

declare module '*.css' {
  const content: string;
  export default content;
}

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}
