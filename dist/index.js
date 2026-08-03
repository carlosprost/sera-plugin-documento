/**
 * Creador de Documentos & Mail-Merge 📄
 * Plugin Oficial de SERA v4
 *
 * Permite redactar plantillas en formato de texto o Markdown e inyectar marcadores de posición
 * correspondientes a las columnas de la tabla activa (ej: {{id}}, {{nombre}}).
 * Genera y descarga de forma 100% offline el documento resultante consolidado.
 */

(function () {
  'use strict';

  if (typeof window.SeraAPI === 'undefined') {
    console.error('[Creador Documentos] window.SeraAPI no está disponible.');
    return;
  }

  const api = window.SeraAPI;
  const PLUGIN_ID = 'sera-plugin-documento';

  // Abre el modal interactivo del creador de documentos
  const abrirCreadorDocumentos = async (tableName, campos, registros) => {
    // Limpiar modal anterior si existiera
    const modalExistente = document.getElementById('doc-editor-modal');
    if (modalExistente) modalExistente.remove();

    const overlay = document.createElement('div');
    overlay.className = 'doc-modal-overlay';
    overlay.id = 'doc-editor-modal';

    // Generar chips HTML para cada campo disponible en la tabla
    const chipsHtml = campos.map((c) => {
      const fieldName = c.Field || c.nombre || '';
      return `<span class="doc-chip" data-field="${fieldName}">+ {{${fieldName}}}</span>`;
    }).join('');

    // Generar bloque default FOR_EACH dinámico
    const primaryKey = campos[0] ? (campos[0].Field || campos[0].nombre) : 'id';
    const defaultTemplateRows = campos.map((c) => {
      const fieldName = c.Field || c.nombre || '';
      return `* **${fieldName}:** {{${fieldName}}}`;
    }).join('\\n');

    const defaultTemplate = `# Reporte Consolidado: ${tableName.toUpperCase()}
Fecha de generación: ${new Date().toLocaleDateString()}
Cantidad de registros: ${registros.length}

---
{{#FOR_EACH}}
### Registro: {{${primaryKey}}}
${defaultTemplateRows}

---
{{/FOR_EACH}}`;

    overlay.innerHTML = `
      <div class="doc-modal">
        <div class="doc-modal-header">
          <span class="modal-icon">📄</span>
          <h3>Creador de Documentos & Mail-Merge offline</h3>
        </div>
        <div class="doc-modal-body">
          <div class="doc-variables-section">
            <span class="doc-variables-label">Variables de la Tabla ("${tableName}"):</span>
            <div class="doc-variables-chips">
              ${chipsHtml || '<span style="font-size:12px;opacity:0.5">Sin campos disponibles</span>'}
            </div>
          </div>
          
          <div class="doc-editor-section">
            <span class="doc-variables-label">Plantilla del Documento (Markdown / Texto):</span>
            <textarea 
              id="doc-text-template" 
              class="doc-textarea" 
              placeholder="Escribe tu plantilla aquí..."
            >${defaultTemplate}</textarea>
          </div>

          <div class="doc-config-row">
            <div class="doc-config-group">
              <span class="doc-variables-label">Nombre del Archivo de Salida:</span>
              <input type="text" id="doc-filename" class="doc-input-text" value="reporte_${tableName}.md">
            </div>
            <div class="doc-config-group">
              <span class="doc-variables-label">Modo de Procesamiento:</span>
              <select id="doc-processing-mode" class="doc-select">
                <option value="consolidado">Combinar todos en un único archivo</option>
                <option value="individual">Exportar solo el primer registro activo</option>
              </select>
            </div>
          </div>
        </div>
        <div class="doc-modal-footer">
          <button id="doc-btn-cancelar" class="doc-btn doc-btn-close">Cancelar</button>
          <button id="doc-btn-generar" class="doc-btn doc-btn-primary">Generar y Descargar</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const textarea = document.getElementById('doc-text-template');

    // Inyectar variables al hacer click en los chips en la posición del cursor
    overlay.querySelectorAll('.doc-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const fieldToken = `{{${chip.getAttribute('data-field')}}}`;
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        const textVal = textarea.value;

        textarea.value = textVal.substring(0, startPos) + fieldToken + textVal.substring(endPos);
        textarea.focus();
        textarea.selectionStart = textarea.selectionEnd = startPos + fieldToken.length;
      });
    });

    // Cerrar modal
    document.getElementById('doc-btn-cancelar').addEventListener('click', () => {
      overlay.remove();
    });

    // Generación del documento
    document.getElementById('doc-btn-generar').addEventListener('click', () => {
      const template = textarea.value;
      const filename = document.getElementById('doc-filename').value || 'documento.md';
      const mode = document.getElementById('doc-processing-mode').value;

      if (!template.trim()) {
        api.env.showNotification('La plantilla no puede estar vacía.', 'warning');
        return;
      }

      if (registros.length === 0) {
        api.env.showNotification('No hay registros en la tabla activa para combinar.', 'warning');
        return;
      }

      let resultadoFinal = '';

      if (mode === 'individual') {
        // Combinar solo el primer registro
        resultadoFinal = procesarRegistro(template, registros[0], campos);
      } else {
        // Combinar todos los registros
        // Soporta la directiva {{#FOR_EACH}} ... {{/FOR_EACH}} si existiera para estructurar loops.
        // Si no la tiene, simplemente combina registro por registro separándolos por un divisor.
        const hasLoop = template.includes('{{#FOR_EACH}}') && template.includes('{{/FOR_EACH}}');

        if (hasLoop) {
          const parts = template.split('{{#FOR_EACH}}');
          const preLoop = parts[0];
          const rest = parts[1].split('{{/FOR_EACH}}');
          const loopTemplate = rest[0];
          const postLoop = rest[1] || '';

          let loopContenido = '';
          registros.forEach((reg) => {
            loopContenido += procesarRegistro(loopTemplate, reg, campos);
          });

          resultadoFinal = preLoop + loopContenido + postLoop;
        } else {
          // Replicar toda la plantilla para cada registro
          const bloques = registros.map((reg) => {
            return procesarRegistro(template, reg, campos);
          });
          resultadoFinal = bloques.join('\n\n---\n\n');
        }
      }

      // Descarga Offline en Blob
      try {
        const blob = new Blob([resultadoFinal], { type: 'text/markdown;charset=utf-8' });
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        
        // Limpieza
        document.body.removeChild(link);
        URL.revokeObjectURL(downloadUrl);

        api.env.showNotification('📄 Documento generado y descargado correctamente', 'success');
        overlay.remove();
      } catch (err) {
        console.error('[Creador Documentos] Error en la descarga offline:', err);
        api.env.showNotification('Ocurrió un error al generar la descarga.', 'error');
      }
    });
  };

  // Reemplaza las variables en la plantilla para un registro específico
  const procesarRegistro = (plantilla, registro, campos) => {
    let output = plantilla;
    campos.forEach((c) => {
      const key = c.Field || c.nombre || '';
      const rawVal = registro[key];
      const val = (rawVal === undefined || rawVal === null) ? '' : String(rawVal);
      
      // Reemplazo recursivo seguro
      const regexToken = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      output = output.replace(regexToken, val);
    });
    return output;
  };

  // 1. REGISTRAR BOTÓN EN EL RIBBON PRINCIPAL
  api.ui.registerRibbonButton({
    id: `${PLUGIN_ID}-open-btn`,
    label: 'Crear Documento',
    icon: 'description',
    tooltip: 'Abre el asistente offline para combinar correspondencia y exportar a Markdown/Texto',
    action: async () => {
      const activeTab = document.querySelector('.desktop-tab-group .mdc-tab--active .tab-title');
      if (!activeTab) {
        api.env.showNotification('Por favor, abrí una tabla para poder crear un documento.', 'info');
        return;
      }

      const rawName = activeTab.textContent.trim().toLowerCase().split(' ').join('_');
      if (rawName.startsWith('res:')) {
        api.env.showNotification('Pestaña de búsqueda activa. Por favor abrí una tabla real.', 'info');
        return;
      }

      try {
        api.env.showNotification('Cargando asistente de combinación...', 'info');
        const campos = await api.data.getCampos(rawName);
        let registros = await api.data.getSelectedRegistros(rawName);
        
        if (!registros || registros.length === 0) {
          registros = await api.data.getContenido(rawName);
        }

        abrirCreadorDocumentos(activeTab.textContent.trim(), campos, registros);
      } catch (err) {
        console.error('[Creador Documentos] Error al abrir el asistente:', err);
        api.env.showNotification('No se pudieron recuperar los metadatos de la tabla.', 'error');
      }
    }
  });

  console.log('[Creador Documentos] Plugin inicializado correctamente ✅');

})();
