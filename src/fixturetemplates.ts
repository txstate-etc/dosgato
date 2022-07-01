import { APITemplate, APITemplateType, WebLink, extractLinksFromText, getKeywords } from '@dosgato/templating'
import { isBlank, isNull } from 'txstate-utils'

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
  getLinks: (data: any) => {
    const links: WebLink[] = []
    links.push({ type: 'url', url: 'https://www.google.com' })
    links.push({ type: 'url', url: 'https://www.apple.com' })
    return links
  },
  getFulltext: (data: any) => {
    return [data.title]
  },
  validate: async (data: any) => {
    const ret: Record<string, string[]> = {}
    if (isBlank(data.title)) {
      ret.title = ['Page title is required.']
    }
    return ret
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
  name: 'Link',
  areas: {},
  migrations: [],
  getLinks: (data: any) => {
    return [data.link]
  },
  getFulltext: (data: any) => {
    return getKeywords(data.text)
  },
  validate: async (data: any) => {
    const errors: Record<string, string[]> = {}
    if (isBlank(data.link)) errors.link = ['Link target is required.']
    return errors
  }
}

export const PanelComponent = {
  type: 'component' as APITemplateType,
  templateKey: 'keyc2',
  name: 'Panel',
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
  name: 'Quote',
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

export const RichTextComponent: APITemplate = {
  type: 'component' as APITemplateType,
  templateKey: 'richtext',
  name: 'Rich Text',
  areas: {},
  migrations: [],
  getLinks: (data: any) => extractLinksFromText(data.text),
  getFulltext: (data: any) => {
    return [...getKeywords(data.title), ...getKeywords(data.text)]
  },
  validate: async (data: any) => {
    const errors: Record<string, string[]> = {}
    if (isBlank(data.text)) errors.text = ['Rich text is required.']
    return errors
  }
}

export const TextImageComponent = {
  type: 'component' as APITemplateType,
  templateKey: 'textimage',
  name: 'Text & Image',
  areas: {},
  migrations: [],
  getLinks: (data: any) => extractLinksFromText(data.text),
  getFulltext: (data: any) => {
    return [...getKeywords(data.title), ...getKeywords(data.text)]
  },
  validate: async (data: any) => {
    const errors: Record<string, string[]> = {}
    if (isBlank(data.title)) errors.title = ['Title is required.']
    return errors
  }
}

export const ColorData = {
  type: 'data' as APITemplateType,
  templateKey: 'keyd1',
  name: 'Colors',
  areas: {},
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.title]
  },
  validate: async (data: any) => {
    const ret: Record<string, string[]> = {}
    if (isNull(data.title)) {
      ret.title = ['Title is required']
    }
    return ret
  }
}

export const BuildingData = {
  type: 'data' as APITemplateType,
  templateKey: 'keyd2',
  name: 'Buildings',
  areas: {},
  migrations: [],
  getLinks: (data: any) => {
    const links: WebLink[] = []
    links.push({ type: 'url', url: 'https://www.google.com' })
    links.push({ type: 'url', url: 'https://www.apple.com' })
    return links
  },
  getFulltext: (data: any) => {
    return [data.name]
  },
  validate: async (data: any) => {
    const ret: Record<string, string[]> = {}
    if (isNull(data.name)) {
      ret.name = ['Building name is required', 'You can not leave the building name blank.']
    }
    if (data.floors && data.floors > 5) {
      ret.floors = ['Building is too tall. Too many stairs to climb']
    }
    return ret
  }
}

export const ArticleData = {
  type: 'data' as APITemplateType,
  templateKey: 'articledatakey',
  name: 'Articles',
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
