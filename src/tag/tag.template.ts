import type { APIDataTemplate, ValidationFeedback } from '@dosgato/templating'
import { isBlank, randomid } from 'txstate-utils'
import type { UserTagGroupData } from '../internal.js'

export const tagTemplate: APIDataTemplate<UserTagGroupData> = {
  type: 'data',
  templateKey: 'dosgato-core-tags',
  name: 'Tags',
  computeName: data => data.title,
  nopublish: true,
  getTags: data => [...data.tags.map(t => t.id), ...data.applicable],
  validate: async (data, extras, nameIsTaken) => {
    const feedback: ValidationFeedback[] = []
    if (isBlank(data.title)) feedback.push({ message: 'Tag Set Name is required.', path: 'title' })
    if (nameIsTaken) feedback.push({ message: 'That name is already in use.', path: 'title' })
    if (!data.applicable?.length) feedback.push({ message: 'Must select at least one applicable type.', path: 'applicable' })
    if (!data.tags?.length) {
      feedback.push({ message: "At least one tag is required. Disable any tags you don't want to be active." })
      return feedback // bail out before we start evaluating tags
    }
    const tagNames = new Set<string>()
    for (let i = 0; i < data.tags.length; i++) {
      const tag = data.tags[i]
      if (isBlank(tag.id)) feedback.push({ message: 'ID is required.', path: `tags.${i}.id` })
      if (isBlank(tag.name)) feedback.push({ message: 'Name is required.', path: `tags.${i}.name` })
      else {
        const lc = tag.name.toLocaleLowerCase()
        if (tagNames.has(lc)) feedback.push({ message: 'Name is already used above.', path: `tags.${i}.name` })
        if (lc.length > 38) feedback.push({ message: 'Name exceeds the maximum length of 38 characters.', path: `tags.${i}.name` })
        tagNames.add(lc)
      }
    }
    const tagIds = new Set(data.tags.map(t => t.id))
    for (const oldtag of extras.currentData?.tags ?? []) {
      if (!tagIds.has(oldtag.id)) {
        feedback.push({ message: 'You deleted one or more tags. The tag(s) will be permanently removed from anything tagged with them.', path: 'tags', type: 'warning' })
        break
      }
    }
    return feedback
  },
  onCopy: data => {
    return {
      ...data,
      tags: data.tags.map(t => ({ ...t, id: randomid(15) }))
    }
  }
}
