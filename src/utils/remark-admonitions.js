import { visit } from 'unist-util-visit';

/** Turn `:::note` style directives into aside elements for styling. */
export function remarkAdmonitions() {
	return (tree) => {
		visit(tree, (node) => {
			if (
				node.type === 'containerDirective' ||
				node.type === 'leafDirective' ||
				node.type === 'textDirective'
			) {
				const data = node.data || (node.data = {});
				data.hName = 'aside';
				data.hProperties = { className: ['admonition', node.name] };
			}
		});
	};
}
