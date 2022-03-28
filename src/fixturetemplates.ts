import { APITemplateType } from '@dosgato/templating'

export const PageTemplate1 = {
  type: 'page' as APITemplateType,
  templateKey: 'keyp1',
  name: 'pagetemplate1',
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
  name: 'pagetemplate2',
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
  name: 'pagetemplate3',
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
  name: 'pagetemplate4',
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
  name: 'componenttemplate1',
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
  name: 'componenttemplate2',
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
  name: 'componenttemplate3',
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
  name: 'datatemplate1',
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
  name: 'datatemplate2',
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
  name: 'articledata',
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
