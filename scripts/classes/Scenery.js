import { PATH } from '../helpers.js';

export default class Scenery extends FormApplication {
  constructor(id) {
    super();
    this.scene = game.scenes.get(id);
  }

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      classes: ['form'],
      closeOnSubmit: true,
      popOut: true,
      editable: game.user.isGM,
      width: 700,
      template: `${PATH}/templates/scenery.hbs`,
      id: 'scenery-config',
      title: game.i18n.localize('SCENERY.APP_NAME'),
    });
  }

  /* -------------------------------------------- */

  /**
   * Obtain module metadata and merge it with game settings which track current module visibility
   * @return {Object}   The data provided to the template when rendering the form
   */
  async getData({}) {
    const flag = this.scene.getFlag('scenery', 'data') || {};
    if (!this.bg) this.bg = flag.bg || this.scene.background.src;
    if (!this.gm) this.gm = flag.gm || this.scene.background.src;
    if (!this.pl) this.pl = flag.pl || this.scene.background.src;
    if (!this.variations) {
      this.variations = [{ name: 'Default', file: this.bg }];
      if (flag.variations) flag.variations.forEach((v) => this.variations.push(v));
    }

    // Add extra empty variation
    this.variations.push({ name: '', file: '' });
    // Return data to the template
    return { variations: this.variations, gm: this.gm, pl: this.pl };
  }

  async getSceneData() {
    const flag = this.scene.getFlag('scenery', 'data') || {};
    const data = {
      "lights": JSON.stringify(canvas.scene.lights),
      "sounds": JSON.stringify(canvas.scene.sounds),
      "tiles": JSON.stringify(canvas.scene.tiles),
      "walls": JSON.stringify(canvas.scene.walls),
    }
  }

  /* -------------------------------------------- */
  /*  Event Listeners and Handlers                */
  /* -------------------------------------------- */

  /** @override */
  activateListeners(html) {
    html.find('.delete').click(() => this.deleteVariation());
    html.find('.preview').click(() => this.previewVariation());
    html.find('.scan').click(() => this.scan());
    html.find('.add').click(() => this.add());
    super.activateListeners(html);
  }

  /**
   * Display a preview window of the scene
   */
  previewVariation() {
    const index = document.activeElement.getAttribute('index');
    const url = this.element.find(`#scenery-row-${index} .image`)[0].value.trim();
    if (url !== '') {
      new ImagePopout(url).render(true);
    }
  }

  /**
   * Remove a row in the variation table
   * @param {string|undefined} index The index of the row
   */
  deleteVariation(index = undefined) {
    if (!index) index = document.activeElement.getAttribute('index');
    this.element.find(`#scenery-row-${index}`).remove();
  }

  /**
   * Remove one or multiple rows with empty file and name
   */
  removeBlankVariations() {
    this.element.find('tr').each((i, el) => {
      const file = $(el).find('.scenery-fp input').val();
      const name = $(el).find('.scenery-name input').val();
      const index = $(el).attr('index');
      if (!file && !name) this.deleteVariation(index);
    });
  }

  /**
  * Add a new empty row to the form
  * @param {string} name
  * @param {string} file
  * @param {int,null} id
  */
  async addVariation(name = '', file = '', id = null) {
    if (id === null) id = Number(this.element.find('tr:last').attr('index')) + 1;
    const row = $(await renderTemplate(`${PATH}/templates/variation.hbs`, { id, name, file }));
    row.find('.delete').click(() => this.deleteVariation());
    row.find('.preview').click(() => this.previewVariation());
    await this.element.find('.scenery-table').append(row);
    super.activateListeners(this.element);
  }

  /**
   * This method is called upon form submission after form data is validated
   * @param {Event} event      The initial triggering submission event
   * @param {Object} formData  The object of validated form data with which to update the object
   * @private
   */
  async _updateObject(event, formData) {
    const sceneData = await this.getSceneData();
    const fd = foundry.utils.expandObject(formData);
    const bg = fd.variations[0].file;
    const variations = Object.values(fd.variations)
      .slice(1)
      .filter((v) => v.file);
    const gm = {
      id: parseInt(formData.gm),
      file: fd.variations[$('input[name="gm"]:checked').val()]?.file
    };
    const pl = {
      id: parseInt(formData.pl),
      file: fd.variations[$('input[name="pl"]:checked').val()]?.file
    };
    if (!gm.file || !pl.file) {
      ui.notifications.error(game.i18n.localize('SCENERY.ERROR_SELECTION'));
      return;
    }
    const data = { variations, bg, gm, pl };
    await this.scene.update({ img: bg });
    this.scene.setFlag('scenery', 'data', data);
  }

  /**
   * Scan for variations in current directory of default img
   */
  async scan() {
    // Get path fo default img
    const path = this.element.find('[name="variations.0.file"]')[0].value;
    // Get paths of all current variant images
    const imagePaths = [];
    Object.entries(this.element.find('input.image')).forEach(k => {
      imagePaths.push(k[1].value);
    });
    // Load list of files in current dir
    const fp = await FilePicker.browse('data', path);
    // Isolate file name and remove extension
    const defName = path.split('/').pop().split('.').slice(0, -1).join('.');
    // For each file in directory...
    const variations = fp.files
      // Remove already existing variant images
      .filter((f) => !imagePaths.includes(f))
      // Find only files which are derivatives of default
      .reduce((acc, file) => {
        // Isolate filename and remove extension
        const fn = file.split('/').pop().split('.').slice(0, -1).join('.');
        // If is a derivative...
        if (fn.toLowerCase().includes(defName.toLowerCase())) {
          // Remove crud from filename
          const name = decodeURIComponent(fn.replace(defName, ''))
            .replace(/[-_]/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
          // Add to found array
          acc.push({ file, name });
        }
        return acc;
      }, [])
      .sort((a, b) => a.name.localeCompare(b.name));
    this.removeBlankVariations();
    // eslint-disable-next-line no-restricted-syntax
    let index = Number(this.element.find('tr:last').attr('index')) + 1;
    variations.forEach((v) => {
      this.addVariation(v.name, v.file, index);
      index++;
    });
    await this.addVariation('', '', index);
  }

  /**
   * Add a new empty row to the form
   */
  add() {
    this.addVariation();
  }

  /**
   * Sets background image of the current scene
   * @param {String} img   The image URL to be used
   * @param {Boolean} draw Used to prevent draw if being called during canvasInit
   */
  static async setImage(img, draw = true) {
    canvas.scene.background.src = img;
    if (draw) {
      // Wait for texture to load
      await TextureLoader.loader.load(
        [img],
        { message: game.i18n.localize('SCENERY.LOADING') },
      );
      await canvas.draw();
    }
  }

  /**
   * React to canvasInit hook to set custom image if needed
   */
  static _onCanvasInit() {
    const data = canvas.scene.getFlag('scenery', 'data');
    if (!data) return;
    const img = (game.user.isGM) ? data.gm.file : data.pl.file;
    if (img) Scenery.setImage(img, false);
  }

  /**
   * React to updateScene hook to set custom image if needed
   * @param {Scene} scene
   * @param {Object} data
   */
  static _onUpdateScene(scene, data) {
    ui.scenes.render();
    if (!scene._view) return;
    if (foundry.utils.hasProperty(data, 'flags.scenery.data')) {
      const img = (game.user.isGM) ? data.flags.scenery.data.gm?.file : data.flags.scenery.data.pl?.file;
      if (img) Scenery.setImage(img);
    }
  }

  /**
   * React to renderSceneDirectory to add count of Scenery variations on SceneDirectory entries.
   * @param {SceneDirectory} sceneDir
   * @param {Object} html
   * @private
   */
  static _onRenderSceneDirectory(sceneDir, html) {
    if (!game.settings.get('scenery', 'showVariationsLabel')) return;
    Object.values(sceneDir.documents)
      .filter((f) => f.flags.scenery !== undefined && f.flags.scenery.data.variations.length > 0)
      .forEach((entry) => {
        const menuEntry = html[0].querySelectorAll(`[data-document-id="${entry._id}"]`)[0];
        const label = document.createElement('label');
        label.classList.add('scenery-variations');
        label.innerHTML = `<i class="fa fa-images"></i> ${entry.flags.scenery.data.variations.length + 1}`;
        menuEntry.prepend(label);
      });
  }

  /**
   * React to getSceneNavigationContext and getSceneDirectoryEntryContext hooks to add Scenery menu entry
   * @param {Object} html
   * @param {Object} entryOptions
   * @private
   */
  static _onContextMenu(html, entryOptions) {
    const viewOption = {
      name: game.i18n.localize('SCENERY.APP_NAME'),
      icon: '<i class="fas fa-images"></i>',
      condition: () => game.user.isGM,
      callback: (el) => {
        const id = el.attr('data-document-id') || el.attr('data-scene-id');
        new Scenery(id).render(true);
      },
    };
    entryOptions.push(viewOption);
  }
}
