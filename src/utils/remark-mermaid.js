import { visit } from 'unist-util-visit';

/** Turn ```mermaid fences into elements for client-side rendering. */
export function remarkMermaid() {
	return (tree) => {
		visit(tree, 'code', (node, index, parent) => {
			if (node.lang !== 'mermaid' || !parent || index === undefined) return;

			parent.children[index] = {
				type: 'html',
				value: `<pre class="mermaid">${node.value}</pre>`,
			};
		});
	};
}
