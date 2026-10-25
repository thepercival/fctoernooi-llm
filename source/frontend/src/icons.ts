import {
  faCircleUser, faHouse, faKey, faPen, faPlus, faRightFromBracket, faRightToBracket,
  faTrash, faUserPlus, faFloppyDisk, faTrophy, type IconDefinition,
} from '@fortawesome/free-solid-svg-icons';

// Same Font Awesome (free-solid) icons as the Angular app, rendered as inline SVG on the server.
function svg(icon: IconDefinition): string {
  const [width, height, , , path] = icon.icon;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="1em" height="1em" fill="currentColor" aria-hidden="true" style="vertical-align:-0.125em"><path d="${path as string}"/></svg>`;
}

export const icons = {
  home: svg(faHouse),
  signIn: svg(faRightToBracket),
  signOut: svg(faRightFromBracket),
  user: svg(faCircleUser),
  userPlus: svg(faUserPlus),
  key: svg(faKey),
  plus: svg(faPlus),
  edit: svg(faPen),
  remove: svg(faTrash),
  save: svg(faFloppyDisk),
  trophy: svg(faTrophy),
};
