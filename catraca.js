/*
 * Senac Connect: simulação da catraca biométrica.
 *
 * Não há integração com equipamentos nem captura de digitais. A "leitura"
 * é apenas uma animação; o aluno é escolhido em uma lista de dados fictícios.
 */
(function () {
  "use strict";

  const { data, catalog, domain, time, ui, constants, MOVEMENT_STATUS } = window.SC;
  const SCAN_DURATION_MS = 1300;

  /* ---------- Regras de negócio ---------- */

  function movementsOfDay(state, alunoId, dateKey) {
    return state.movimentos
      .filter((item) => item.alunoId === alunoId && time.dateKeyOf(item.timestamp) === dateKey)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /** Procura uma liberação aprovada, ainda não usada, para o dia e horário da saída. */
  function findValidAuthorization(state, alunoId, timestamp) {
    const dateKey = time.dateKeyOf(timestamp);
    const exitMinutes = time.minutesOf(time.timeOf(timestamp));
    return (
      state.solicitacoes
        .filter(
          (item) =>
            item.alunoId === alunoId &&
            item.status === "aprovada" &&
            !item.utilizadaEm &&
            item.data === dateKey &&
            exitMinutes >= time.minutesOf(item.horario) - constants.AUTHORIZATION_TOLERANCE_MINUTES
        )
        .sort((a, b) => time.minutesOf(a.horario) - time.minutesOf(b.horario))[0] || null
    );
  }

  /** Saída depois do fim do turno é regular; antes dele, exige liberação aprovada. */
  function classifyExit(state, aluno, timestamp) {
    const turma = catalog.getTurma(aluno.turmaId);
    if (time.minutesOf(time.timeOf(timestamp)) >= time.minutesOf(turma.fim)) {
      return { situacao: "regular", solicitacao: null };
    }
    const solicitacao = findValidAuthorization(state, aluno.id, timestamp);
    return solicitacao
      ? { situacao: "autorizada", solicitacao }
      : { situacao: "sem_liberacao", solicitacao: null };
  }

  function validateSequence(state, alunoId, tipo, timestamp) {
    const events = movementsOfDay(state, alunoId, time.dateKeyOf(timestamp));
    const last = events[events.length - 1];
    if (last && last.timestamp >= timestamp) {
      return `Já existe um evento às ${time.timeOf(last.timestamp)} nesse dia. Informe um horário posterior.`;
    }
    if (tipo === "saida" && (!last || last.tipo === "saida")) {
      return "Não há entrada aberta para este aluno nesse dia. Registre a entrada primeiro.";
    }
    if (tipo === "entrada" && last && last.tipo === "entrada") {
      return `O aluno já está com entrada registrada às ${time.timeOf(last.timestamp)}. Registre a saída.`;
    }
    return "";
  }

  function suggestEventType(state, alunoId, dateKey) {
    const events = movementsOfDay(state, alunoId, dateKey);
    const last = events[events.length - 1];
    return last && last.tipo === "entrada" ? "saida" : "entrada";
  }

  function registerEvent({ alunoId, tipo, timestamp }) {
    const aluno = catalog.getAluno(alunoId);
    if (!aluno) return { ok: false, error: "Aluno não encontrado." };

    const error = validateSequence(data.getState(), alunoId, tipo, timestamp);
    if (error) return { ok: false, error };

    return data.commit((state) => {
      if (tipo === "entrada") {
        const movimento = domain.appendMovement(state, { alunoId, tipo, situacao: "entrada", timestamp });
        return { ok: true, movimento, solicitacao: null };
      }
      const { situacao, solicitacao } = classifyExit(state, aluno, timestamp);
      if (solicitacao) {
        const stored = state.solicitacoes.find((item) => item.id === solicitacao.id);
        stored.utilizadaEm = timestamp;
      }
      const movimento = domain.appendMovement(state, {
        alunoId,
        tipo,
        situacao,
        timestamp,
        solicitacaoId: solicitacao ? solicitacao.id : null,
      });
      return { ok: true, movimento, solicitacao };
    });
  }

  /* ---------- Interface da demonstração ---------- */

  function mount() {
    const form = document.getElementById("catracaForm");
    if (!form) return;

    const els = {
      device: document.getElementById("catracaDevice"),
      title: document.getElementById("catracaScreenTitle"),
      text: document.getElementById("catracaScreenText"),
      aluno: document.getElementById("catracaAluno"),
      alunoError: document.getElementById("catracaAlunoError"),
      identify: document.getElementById("catracaIdentify"),
      eventFieldset: document.getElementById("catracaEvent"),
      suggestion: document.getElementById("catracaSuggestion"),
      date: document.getElementById("catracaData"),
      hour: document.getElementById("catracaHora"),
      now: document.getElementById("catracaNow"),
      error: document.getElementById("catracaError"),
      result: document.getElementById("catracaResult"),
      log: document.getElementById("catracaLog"),
      steps: [...form.querySelectorAll("[data-step]")],
    };
    let identifiedId = null;
    let scanTimer = null;

    els.aluno.insertAdjacentHTML(
      "beforeend",
      catalog.alunos
        .map(
          (aluno) =>
            `<option value="${aluno.id}">${ui.escapeHtml(aluno.nome)} · ${ui.escapeHtml(catalog.turmaLabel(aluno.turmaId))}</option>`
        )
        .join("")
    );

    function setStep(step) {
      els.steps.forEach((item) => {
        const number = Number(item.dataset.step);
        item.classList.toggle("is-active", number === step);
        item.classList.toggle("is-done", number < step);
      });
    }

    function setScreen(state, title, text) {
      els.device.dataset.state = state;
      els.title.textContent = title;
      els.text.textContent = text;
    }

    function fillNow() {
      const now = new Date();
      els.date.value = time.toDateKey(now);
      els.hour.value = time.toTimeKey(now);
    }

    // Só pré-seleciona o tipo na identificação; depois disso, respeita a escolha do usuário.
    function updateSuggestion({ preselect = false } = {}) {
      if (!identifiedId || !els.date.value) return;
      const suggested = suggestEventType(data.getState(), identifiedId, els.date.value);
      if (preselect) form.querySelector(`input[name=catracaTipo][value=${suggested}]`).checked = true;
      const aluno = catalog.getAluno(identifiedId);
      const turma = catalog.getTurma(aluno.turmaId);
      els.suggestion.textContent =
        suggested === "saida"
          ? `${aluno.nome.split(" ")[0]} está dentro da escola. Turno até ${turma.fim}: saídas antes disso exigem liberação aprovada.`
          : `Sem entrada aberta nesse dia. Turno das ${turma.inicio} às ${turma.fim}.`;
    }

    function resetIdentification() {
      window.clearTimeout(scanTimer);
      identifiedId = null;
      els.eventFieldset.disabled = true;
      els.identify.disabled = false;
      els.suggestion.textContent = "";
      els.error.textContent = "";
      setStep(els.aluno.value ? 2 : 1);
      setScreen("idle", "Aguardando identificação", els.aluno.value ? "Clique em “Simular identificação”." : "Selecione um aluno e simule a leitura.");
    }

    els.aluno.addEventListener("change", () => {
      els.alunoError.textContent = "";
      els.aluno.removeAttribute("aria-invalid");
      els.result.hidden = true;
      resetIdentification();
    });

    els.identify.addEventListener("click", () => {
      if (!els.aluno.value) {
        els.alunoError.textContent = "Selecione o aluno que vai passar pela catraca.";
        els.aluno.setAttribute("aria-invalid", "true");
        els.aluno.focus();
        return;
      }
      const aluno = catalog.getAluno(els.aluno.value);
      els.identify.disabled = true;
      els.result.hidden = true;
      setScreen("scanning", "Lendo…", "Simulando a leitura biométrica.");

      scanTimer = window.setTimeout(() => {
        identifiedId = aluno.id;
        els.identify.disabled = false;
        els.eventFieldset.disabled = false;
        setStep(3);
        setScreen("identified", aluno.nome, `Matrícula ${aluno.matricula} · ${catalog.turmaLabel(aluno.turmaId)}`);
        fillNow();
        updateSuggestion({ preselect: true });
      }, SCAN_DURATION_MS);
    });

    els.now.addEventListener("click", () => {
      fillNow();
      updateSuggestion();
    });
    els.date.addEventListener("change", () => updateSuggestion());

    function renderResult(result) {
      const { movimento, solicitacao } = result;
      const aluno = catalog.getAluno(movimento.alunoId);
      const meta = MOVEMENT_STATUS[movimento.situacao];
      const details = {
        entrada: "Entrada registrada. O responsável recebeu uma notificação de chegada.",
        regular: "Saída após o fim do turno, sem necessidade de liberação. O responsável foi notificado.",
        autorizada: solicitacao
          ? `Liberação aprovada para ${solicitacao.horario} encontrada (motivo: ${solicitacao.motivo}). O responsável foi notificado.`
          : "",
        sem_liberacao:
          "Nenhuma liberação aprovada para este horário. Um alerta foi aberto no painel institucional e o responsável recebeu uma notificação de ocorrência.",
      };
      els.result.className = `catraca-result catraca-result--${meta.tone}`;
      els.result.innerHTML = `
        ${ui.icon(meta.icon)}
        <div>
          <p class="catraca-result__title">${ui.badge(meta)} <span>${ui.escapeHtml(aluno.nome)} · ${ui.escapeHtml(time.formatTimestamp(movimento.timestamp))}</span></p>
          <p>${ui.escapeHtml(details[movimento.situacao])}</p>
        </div>`;
      els.result.hidden = false;
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      els.error.textContent = "";
      const tipo = form.querySelector("input[name=catracaTipo]:checked");
      if (!identifiedId) {
        els.error.textContent = "Faça a identificação do aluno antes de registrar.";
        return;
      }
      if (!tipo || !els.date.value || !els.hour.value) {
        els.error.textContent = "Escolha o tipo de evento e informe data e horário.";
        return;
      }

      const timestamp = time.fromKeys(els.date.value, els.hour.value).getTime();
      const result = registerEvent({ alunoId: identifiedId, tipo: tipo.value, timestamp });
      if (!result.ok) {
        els.error.textContent = result.error;
        setScreen("error", "Evento não registrado", result.error);
        return;
      }

      const blocked = result.movimento.situacao === "sem_liberacao";
      setScreen(
        blocked ? "alert" : "success",
        MOVEMENT_STATUS[result.movimento.situacao].label,
        `${catalog.getAluno(identifiedId).nome} · ${time.timeOf(timestamp)}`
      );
      renderResult(result);
      identifiedId = null;
      els.eventFieldset.disabled = true;
      els.suggestion.textContent = "";
      setStep(2);
    });

    function renderLog() {
      const latest = [...data.getState().movimentos].sort((a, b) => b.timestamp - a.timestamp).slice(0, 8);
      els.log.innerHTML = latest.length
        ? latest
            .map((movimento) => {
              const aluno = catalog.getAluno(movimento.alunoId);
              return `
                <li class="event-row">
                  <time datetime="${new Date(movimento.timestamp).toISOString()}">${ui.escapeHtml(time.formatTimestamp(movimento.timestamp))}</time>
                  <span class="event-row__main"><strong>${ui.escapeHtml(aluno.nome)}</strong><small>${ui.escapeHtml(catalog.turmaLabel(aluno.turmaId))}</small></span>
                  ${ui.badge(MOVEMENT_STATUS[movimento.situacao])}
                </li>`;
            })
            .join("")
        : `<li>${ui.emptyState("Nenhum evento registrado")}</li>`;
    }

    renderLog();
    data.subscribe(() => {
      renderLog();
      updateSuggestion();
    });
  }

  window.SC.catraca = { registerEvent, findValidAuthorization, classifyExit };
  document.addEventListener("DOMContentLoaded", mount);
})();
