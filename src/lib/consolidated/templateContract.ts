import Docxtemplater from 'docxtemplater';
import PizZip from 'pizzip';

type TagTree = { [key: string]: TagTree };

/** Uses Docxtemplater's compiled Word tokens, including tags split across runs. */
export function templateTags(template: ArrayBuffer | Uint8Array): TagTree {
  const document = new Docxtemplater(new PizZip(template), { paragraphLoop: true, linebreaks: true });
  const tags: TagTree = {};
  const visit = (parts: any[], target: TagTree) => {
    for (const part of parts) {
      if (part.type !== 'placeholder') continue;
      target[part.value] ||= {};
      if (part.subparsed) visit(part.subparsed, target[part.value]);
    }
  };
  for (const compiled of Object.values((document as any).compiled) as any[]) visit(compiled.postparsed, tags);
  return tags;
}

export function templateDataProblems(tags: TagTree, data: Record<string, any>, path = ''): string[] {
  const problems: string[] = [];
  for (const [key, children] of Object.entries(tags)) {
    const name = `${path}${key}`;
    if (!Object.hasOwn(data, key)) { problems.push(`Missing template value: ${name}`); continue; }
    if (Object.keys(children).length) {
      if (!Array.isArray(data[key])) { problems.push(`Expected loop array: ${name}`); continue; }
      data[key].forEach((row: any, index: number) => {
        if (!row || typeof row !== 'object') problems.push(`Invalid loop row: ${name}[${index}]`);
        else problems.push(...templateDataProblems(children, row, `${name}[${index}].`));
      });
    }
  }
  for (const key of Object.keys(data)) if (!Object.hasOwn(tags, key)) problems.push(`Unused template value: ${path}${key}`);
  return problems;
}
