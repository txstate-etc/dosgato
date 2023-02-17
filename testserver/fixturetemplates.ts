import { WebLink, extractLinksFromText, getKeywords, ValidationFeedback, APIComponentTemplate, APIPageTemplate, APIDataTemplate } from '@dosgato/templating'
import { isBlank } from 'txstate-utils'

export const PageTemplate1: APIPageTemplate = {
  type: 'page',
  templateKey: 'keyp1',
  name: 'pagetemplate1',
  areas: {
    links: ['keyc1'],
    main: ['keyc2', 'keyc3', 'richtext', 'horizontalrule']
  },
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.title]
  },
  validate: async (data: any) => {
    const errors: ValidationFeedback[] = []
    if (isBlank(data.title)) {
      errors.push({ path: 'title', message: 'Page title is required.' })
    } else if (data.title.length < 5) {
      errors.push({ path: 'title', message: 'Page title must be at least 5 characters.' })
    }
    return errors
  }
}

export const PageTemplate2: APIPageTemplate = {
  type: 'page',
  templateKey: 'keyp2',
  name: 'pagetemplate2',
  areas: {
    content: ['keyc1', 'keyc2', 'keyc3', 'richtext', 'horizontalrule']
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
    const errors: ValidationFeedback[] = []
    if (isBlank(data.title)) {
      errors.push({ path: 'title', message: 'Page title is required.' })
    }
    return errors
  }
}

export const PageTemplate3: APIPageTemplate = {
  type: 'page',
  templateKey: 'keyp3',
  name: 'pagetemplate3',
  areas: {
    content: ['keyc1', 'keyc2', 'keyc3', 'richtext', 'horizontalrule']
  },
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.title]
  }
}

export const PageTemplate4: APIPageTemplate = {
  type: 'page',
  templateKey: 'keyp4',
  name: 'pagetemplate4',
  areas: {
    content: ['keyc3', 'richtext', 'horizontalrule']
  },
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.title]
  }
}

export const LinkComponent: APIComponentTemplate = {
  type: 'component',
  templateKey: 'keyc1',
  name: 'Link',
  migrations: [],
  getLinks: (data: any) => {
    return [data.link]
  },
  getFulltext: (data: any) => {
    return getKeywords(data.text)
  },
  validate: async (data: any) => {
    const errors: ValidationFeedback[] = []
    if (isBlank(data.link)) errors.push({ path: 'link', message: 'Link target is required.' })
    return errors
  }
}

export const PanelComponent: APIComponentTemplate = {
  type: 'component',
  templateKey: 'keyc2',
  name: 'Panel',
  displayCategory: 'Containers',
  areas: {
    content: [
      'keyc3',
      'richtext',
      'keyc1'
    ]
  },
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.text, data.title]
  }
}

export const QuoteComponent: APIComponentTemplate = {
  type: 'component',
  templateKey: 'keyc3',
  name: 'Quote',
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.quote, data.author]
  }
}

export const RichTextComponent: APIComponentTemplate = {
  type: 'component',
  templateKey: 'richtext',
  name: 'Rich Text',
  areas: {},
  migrations: [],
  getLinks: (data: any) => extractLinksFromText(data.text),
  getFulltext: (data: any) => {
    return [...getKeywords(data.title), ...getKeywords(data.text)]
  },
  validate: async (data: any) => {
    const errors: ValidationFeedback[] = []
    if (isBlank(data.text)) errors.push({ message: 'Rich text is required.', path: 'text' })
    return errors
  }
}

export const TextImageComponent: APIComponentTemplate = {
  type: 'component',
  templateKey: 'textimage',
  name: 'Text & Image',
  areas: {},
  migrations: [],
  getLinks: (data: any) => extractLinksFromText(data.text),
  getFulltext: (data: any) => {
    return [...getKeywords(data.title), ...getKeywords(data.text)]
  },
  validate: async (data: any) => {
    const errors: ValidationFeedback[] = []
    if (isBlank(data.title)) errors.push({ path: 'title', message: 'Title is required.' })
    return errors
  }
}

export const HorizontalRule: APIComponentTemplate = {
  type: 'component',
  templateKey: 'horizontalrule',
  name: 'Horizontal Rule'
}

export const ColorData: APIDataTemplate = {
  type: 'data',
  templateKey: 'keyd1',
  name: 'Colors',
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.title]
  },
  validate: async (data: any) => {
    const errors: ValidationFeedback[] = []
    if (isBlank(data.title)) {
      errors.push({ path: 'title', message: 'Title is required' })
    }
    return errors
  }
}

export const BuildingData: APIDataTemplate = {
  type: 'data',
  templateKey: 'keyd2',
  name: 'Buildings',
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
    const errors: ValidationFeedback[] = []
    if (isBlank(data.name)) {
      errors.push({ path: 'name', message: 'Building name is required.' })
    }
    if (data.floors && data.floors > 5) {
      errors.push({ path: 'floors', message: 'Building is too tall. Too many stairs to climb' })
    }
    return errors
  }
}

export const ArticleData: APIDataTemplate = {
  type: 'data',
  templateKey: 'articledatakey',
  name: 'Articles',
  migrations: [],
  getLinks: (data: any) => [],
  getFulltext: (data: any) => {
    return [data.title, data.author]
  }
}
