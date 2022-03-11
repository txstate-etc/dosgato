import { APITemplateType } from '@dosgato/templating'

export const PageTemplate1 = {
  type: 'page' as APITemplateType,
  templateKey: 'keyp1',
  areas: {
    links: ['keyc1'],
    main: ['keyc2', 'keyc3']
  },
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.title]
  },
  validate: async (data: any) => {
    return {}
  }
}

export const PageTemplate2 = {
  type: 'page' as APITemplateType,
  templateKey: 'keyp2',
  areas: {
    content: ['keyc1', 'keyc2', 'keyc3']
  },
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.title]
  },
  validate: async (data: any) => {
    return {}
  }
}

export const PageTemplate3 = {
  type: 'page' as APITemplateType,
  templateKey: 'keyp3',
  areas: {
    content: ['keyc1', 'keyc2', 'keyc3']
  },
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.title]
  },
  validate: async (data: any) => {
    return {}
  }
}

export const PageTemplate4 = {
  type: 'page' as APITemplateType,
  templateKey: 'keyp4',
  areas: {
    content: ['keyc3']
  },
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.title]
  },
  validate: async (data: any) => {
    return {}
  }
}

export const LinkComponent = {
  type: 'component' as APITemplateType,
  templateKey: 'keyc1',
  areas: {},
  migrations: [],
  getLinks: (data: any) => {
    return [data.link]
  },
  getFulltext: (data: any) => {
    return [data.text]
  },
  validate: async (data: any) => {
    return {}
  }
}

export const PanelComponent = {
  type: 'component' as APITemplateType,
  templateKey: 'keyc2',
  areas: {},
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.text, data.title]
  },
  validate: async (data: any) => {
    return {}
  }
}

export const QuoteComponent = {
  type: 'component' as APITemplateType,
  templateKey: 'keyc3',
  areas: {},
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.quote, data.author]
  },
  validate: async (data: any) => {
    return {}
  }
}

export const ColorData = {
  type: 'data' as APITemplateType,
  templateKey: 'keyd1',
  areas: {},
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.title]
  },
  validate: async (data: any) => {
    return {}
  }
}

export const BuildingData = {
  type: 'data' as APITemplateType,
  templateKey: 'keyd2',
  areas: {},
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.name]
  },
  validate: async (data: any) => {
    return {}
  }
}

export const ArticleData = {
  type: 'data' as APITemplateType,
  templateKey: 'articledatakey',
  areas: {},
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.title, data.author]
  },
  validate: async (data: any) => {
    return {}
  }
}
