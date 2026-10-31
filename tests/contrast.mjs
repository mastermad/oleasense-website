/**
 * Convertit une couleur hexadécimale en canaux RGB, pour calculer les contrastes WCAG
 * à partir des jetons du design system sans dépendance externe.
 *
 * @param {string} hex couleur `#rgb` ou `#rrggbb` (le `#` est optionnel).
 * @returns {number[]} les canaux [r, g, b] entiers entre 0 et 255.
 * @throws {Error} si la chaîne n'est pas une couleur hexadécimale valide.
 */
export const parseHex = hex => {
  const value = hex.replace('#', '');
  const full = value.length === 3 ? [...value].map(c => c + c).join('') : value;
  if (!/^[0-9a-f]{6}$/i.test(full)) throw new Error(`couleur invalide : ${hex}`);
  return [0, 2, 4].map(i => parseInt(full.slice(i, i + 2), 16));
};

/**
 * Calcule la luminance relative d'une couleur selon la formule WCAG 2.x
 * (linéarisation sRGB puis pondération perceptuelle).
 *
 * @param {string} hex couleur hexadécimale, voir {@link parseHex}.
 * @returns {number} luminance entre 0 (noir) et 1 (blanc).
 * @throws {Error} si la couleur est invalide.
 */
export const luminance = hex => {
  const [r, g, b] = parseHex(hex).map(channel => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

/**
 * Ratio de contraste WCAG entre deux couleurs, indépendant de leur ordre.
 * Seuils utilisés par les tests : 4,5:1 pour le texte, 3:1 pour le focus et les contrôles.
 *
 * @param {string} foreground couleur du texte ou du contrôle.
 * @param {string} background couleur du fond.
 * @returns {number} ratio entre 1 et 21.
 * @throws {Error} si une des couleurs est invalide.
 */
export const contrastRatio = (foreground, background) => {
  const [a, b] = [luminance(foreground), luminance(background)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};
