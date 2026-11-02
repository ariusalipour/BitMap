export type ComponentAppearance = { kind: string; label: string; svg: string };

type IconDefinition = { kind: string; label: string; drawing: string };

const icons: Record<string, IconDefinition> = {
  property: { kind: 'property', label: 'Property', drawing: '<path d="M3 5h14M3 10h14M3 15h14"/><circle cx="7" cy="5" r="2"/><circle cx="13" cy="10" r="2"/><circle cx="8" cy="15" r="2"/>' },
  type: { kind: 'type', label: 'Type', drawing: '<path d="M3 4h14M10 4v12M6 16h8M3 3v3M17 3v3"/>' },
  hook: { kind: 'hook', label: 'Hook', drawing: '<path d="M12 3v9a4 4 0 0 1-8 0v-2M4 10l-2 3M4 10l2 3"/><circle cx="12" cy="3" r="1.5"/>' },
  class: { kind: 'class', label: 'Class', drawing: '<path d="M10 2.5 17 6.3v7.4L10 17.5 3 13.7V6.3z"/><path d="m3.2 6.4 6.8 3.8 6.8-3.8M10 10.2v7"/>' },
  interface: { kind: 'interface', label: 'Interface', drawing: '<circle cx="10" cy="10" r="7"/><path d="M8 6.5h4M10 6.5v7M8 13.5h4"/>' },
  function: { kind: 'function', label: 'Function', drawing: '<path d="M7 4.5H5.8A2.3 2.3 0 0 0 3.5 6.8v1A2.2 2.2 0 0 1 1.8 10a2.2 2.2 0 0 1 1.7 2.2v1a2.3 2.3 0 0 0 2.3 2.3H7M13 4.5h1.2a2.3 2.3 0 0 1 2.3 2.3v1a2.2 2.2 0 0 0 1.7 2.2 2.2 2.2 0 0 0-1.7 2.2v1a2.3 2.3 0 0 1-2.3 2.3H13M8.3 13.8l3.4-7.6"/>' },
  method: { kind: 'method', label: 'Method', drawing: '<path d="M10 2.7a4.2 4.2 0 0 0-3.8 6L2.8 12l5.2 5.2 3.3-3.4a4.2 4.2 0 0 0 6-3.8 4 4 0 0 0-.4-1.7l-2.6 2.6-3.2-3.2 2.6-2.6a4 4 0 0 0-1.7-.4z"/>' },
  module: { kind: 'module', label: 'Module', drawing: '<path d="M3 5.2 10 2.5l7 2.7v9.6l-7 2.7-7-2.7z"/><path d="m3.2 5.3 6.8 2.6 6.8-2.6M10 7.9v9.4"/>' },
  file: { kind: 'file', label: 'File', drawing: '<path d="M5 2.8h6l4 4v10.4H5z"/><path d="M11 2.8v4h4M7.5 10h5M7.5 13h5"/>' },
  folder: { kind: 'folder', label: 'Folder', drawing: '<path d="M2.5 5.5h6l1.6 1.8h7.4v7.2H2.5z"/><path d="M2.5 7.3V4.5h5l1.4 1"/>' },
  service: { kind: 'service', label: 'Service', drawing: '<rect x="3" y="3" width="14" height="5.5" rx="1.5"/><rect x="3" y="11.5" width="14" height="5.5" rx="1.5"/><path d="M6 5.75h.1M6 14.25h.1M10 5.75h4M10 14.25h4"/>' },
  database: { kind: 'database', label: 'Database', drawing: '<ellipse cx="10" cy="4.5" rx="6.5" ry="2.5"/><path d="M3.5 4.5v10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5v-10M3.5 9.5C3.5 10.9 6.4 12 10 12s6.5-1.1 6.5-2.5"/>' },
  queue: { kind: 'queue', label: 'Queue', drawing: '<path d="M4 4.5h12M4 8h12M4 11.5h8M4 15h8M14 13l2 2-2 2"/>' },
  ui: { kind: 'ui', label: 'UI View', drawing: '<rect x="2.5" y="3.5" width="15" height="13" rx="1.8"/><path d="M2.8 7h14.4M5.2 5.3h.1M7.2 5.3h.1M6 10h3v4H6zM11 10h4M11 12h4M11 14h2"/>' },
  interaction: { kind: 'interaction', label: 'Interaction', drawing: '<path d="m4 2.5 11.5 8-5.5 1-2.5 5.5zM10.5 12l3 4.5"/>' },
  validation: { kind: 'validation', label: 'Validation', drawing: '<circle cx="10" cy="10" r="7"/><path d="m6.5 10 2.3 2.4 4.7-5"/>' },
  build: { kind: 'build', label: 'Build Pipeline', drawing: '<path d="M3 5h4v4H3zM13 11h4v4h-4zM7 7h3a2 2 0 0 1 2 2v3M10 12l2 2 2-2"/>' },
  security: { kind: 'security', label: 'Security', drawing: '<path d="M10 2.5 16 5v4.8c0 3.6-2.5 6.2-6 7.7-3.5-1.5-6-4.1-6-7.7V5z"/><path d="m7.3 9.8 1.8 1.8 3.7-3.8"/>' },
  component: { kind: 'component', label: 'Component', drawing: '<path d="M10 2.5 16.5 6v8L10 17.5 3.5 14V6z"/><circle cx="10" cy="10" r="1.7"/>' },
};

const typeRules: Array<[keyof typeof icons, RegExp]> = [
  ['class', /^(?:class|klass)$/],
  ['interface', /^(?:interface|protocol)$/],
  ['method', /^(?:method|constructor)$/],
  ['property', /^(?:property|field)$/],
  ['type', /^(?:type|enum)$/],
  ['hook', /^hook$/],
  ['function', /^(?:function|func|procedure|callback|handler)$/],
  ['module', /^(?:module|package|namespace)$/],
  ['folder', /^(?:folder|directory|dir)$/],
  ['file', /^(?:file|sourcefile|configfile|testfile)$/],
  ['service', /^(?:service|server|api|http)$/],
  ['database', /^(?:database|db|storage|store|cache)$/],
  ['queue', /^(?:queue|worker|job)$/],
  ['ui', /^(?:ui|view|viewport|frontend|screen|page)$/],
  ['interaction', /^(?:pointer|gesture|interaction)$/],
  ['build', /^(?:build|compiler|pipeline|workflow)$/],
  ['validation', /^(?:validation|validator|schema)$/],
  ['security', /^(?:security|auth|sanitisation|sanitization|sanitiser|sanitizer)$/],
];

function tokens(value: string): string[] {
  return value.replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
}

function svg(drawing: string): string {
  return `<svg aria-hidden="true" focusable="false" viewBox="0 0 20 20" width="16" height="16" class="component-icon" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round">${drawing}</svg>`;
}

export function getComponentAppearance(node: { type: string; path?: string | null; shape?: string | null }): ComponentAppearance {
  // Explicit type tokens take precedence over every inferred hint.
  const typeTokens = tokens(node.type);
  for (const [kind, pattern] of typeRules) {
    if (typeTokens.some(token => pattern.test(token))) {
      const icon = icons[kind];
      return { kind: icon.kind, label: icon.label, svg: svg(icon.drawing) };
    }
  }

  const shapeTokens = tokens(node.shape ?? '');
  if (shapeTokens.some(token => /^(?:database|db|storage|cache)$/.test(token))) {
    const icon = icons.database;
    return { kind: icon.kind, label: icon.label, svg: svg(icon.drawing) };
  }
  if (shapeTokens.some(token => /^(?:queue|worker)$/.test(token))) {
    const icon = icons.queue;
    return { kind: icon.kind, label: icon.label, svg: svg(icon.drawing) };
  }

  const path = node.path ?? '';
  if (/[\\/]$/.test(path) || /^(?:folder|directory)$/i.test(path)) {
    const icon = icons.folder;
    return { kind: icon.kind, label: icon.label, svg: svg(icon.drawing) };
  }
  const filename = path.split(/[\\/]/).pop() ?? '';
  if (filename) {
    // File extensions can safely hint at file roles, never at code symbols.
    const icon = /(?:^|[.-])(?:test|spec)(?:\.|$)/i.test(filename)
      ? { ...icons.file, kind: 'test-file', label: 'Test File' }
      : /\.(?:json|ya?ml|toml|ini|conf|config)$/i.test(filename)
        ? { ...icons.file, kind: 'config-file', label: 'Config File' }
        : icons.file;
    return { kind: icon.kind, label: icon.label, svg: svg(icon.drawing) };
  }
  const icon = icons.component;
  return { kind: icon.kind, label: icon.label, svg: svg(icon.drawing) };
}
