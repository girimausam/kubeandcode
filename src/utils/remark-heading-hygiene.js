import { visit } from 'unist-util-visit';

/**
 * Ensures strict heading hygiene:
 * - Demotes or removes markdown h1 headings so the page template h1 remains the sole h1.
 * - Prevents heading level skips (e.g. h1 -> h3).
 */
export function remarkHeadingHygiene() {
  return (tree) => {
    // 1. Demote any h1 in markdown body to h2
    visit(tree, 'heading', (node) => {
      if (node.depth === 1) {
        node.depth = 2;
      }
    });

    // 2. Fix heading level skips: ensure no heading depth jumps by more than 1
    let previousDepth = 2;
    visit(tree, 'heading', (node) => {
      if (node.depth > previousDepth + 1) {
        node.depth = previousDepth + 1;
      }
      previousDepth = node.depth;
    });
  };
}

