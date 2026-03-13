import React, { useMemo, useState } from 'react';
import { Check, Layers, Plus, Search, ScrollText, Wand2 } from 'lucide-react';
import { useCanvas } from '../../context/CanvasContext';

interface MobileWorkspaceQuickBarProps {
  onSearch: () => void;
  onOpenPromptLibrary: () => void;
  onTogglePromptOptimization: () => void;
  promptOptimizationEnabled: boolean;
  promptOptimizationSupported: boolean;
}

const MobileWorkspaceQuickBar: React.FC<MobileWorkspaceQuickBarProps> = ({
  onSearch,
  onOpenPromptLibrary,
  onTogglePromptOptimization,
  promptOptimizationEnabled,
  promptOptimizationSupported,
}) => {
  const { state, activeCanvas, createCanvas, switchCanvas, canCreateCanvas } = useCanvas();
  const [showProjects, setShowProjects] = useState(false);

  const activeProjectName = activeCanvas?.name || '\u9879\u76ee';
  const projectCount = state.canvases.length;

  const projectLabel = useMemo(() => {
    if (projectCount <= 1) {
      return '\u5f53\u524d\u9879\u76ee';
    }

    return `${projectCount} \u4e2a\u9879\u76ee`;
  }, [projectCount]);

  return (
    <>
      <div className="ios-mobile-project-strip-wrap">
        <div className="ios-mobile-header-glass ios-mobile-project-strip">
          <div className="ios-mobile-project-grid">
            <div className="relative min-w-0">
              <button
                type="button"
                onClick={() => setShowProjects((prev) => !prev)}
                className={`ios-mobile-project-pill ${showProjects ? 'is-active' : ''}`}
                aria-label="\u6253\u5f00\u9879\u76ee\u5217\u8868"
                title={activeProjectName}
              >
                <span className="ios-mobile-project-pill-icon">
                  <Layers size={18} />
                </span>
                <span className="ios-mobile-project-pill-copy">
                  <span className="ios-mobile-project-pill-label">{projectLabel}</span>
                  <span className="ios-mobile-project-pill-value">{activeProjectName}</span>
                </span>
              </button>

              {showProjects ? (
                <div className="ios-mobile-project-dropdown">
                  <div className="ios-mobile-project-dropdown__header">
                    <span>{'\u9879\u76ee'}</span>
                    <span>{projectCount}</span>
                  </div>

                  <div className="ios-mobile-project-dropdown__body">
                    {state.canvases.map((canvas) => {
                      const isActive = canvas.id === activeCanvas?.id;

                      return (
                        <button
                          key={canvas.id}
                          type="button"
                          className={`ios-mobile-project-dropdown__item ${isActive ? 'is-active' : ''}`}
                          title={canvas.name}
                          onClick={() => {
                            switchCanvas(canvas.id);
                            setShowProjects(false);
                          }}
                        >
                          <span className="truncate">{canvas.name}</span>
                          {isActive ? <Check size={15} /> : null}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    className={`ios-mobile-project-dropdown__create ${canCreateCanvas ? '' : 'is-disabled'}`}
                    onClick={() => {
                      if (!canCreateCanvas) {
                        return;
                      }

                      createCanvas();
                      setShowProjects(false);
                    }}
                    disabled={!canCreateCanvas}
                  >
                    <Plus size={15} />
                    <span>{canCreateCanvas ? '\u65b0\u5efa\u9879\u76ee' : '\u9879\u76ee\u5df2\u6ee1'}</span>
                  </button>
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={onSearch}
              className="ios-mobile-project-pill ios-mobile-project-pill--search"
              aria-label="\u6253\u5f00\u641c\u7d22"
              title="\u641c\u7d22\u5361\u7ec4"
            >
              <span className="ios-mobile-project-pill-icon">
                <Search size={18} />
              </span>
              <span className="ios-mobile-project-pill-copy">
                <span className="ios-mobile-project-pill-label">{'\u67e5\u627e'}</span>
                <span className="ios-mobile-project-pill-value">{'\u641c\u7d22\u5361\u7ec4'}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenPromptLibrary}
              className="ios-mobile-project-pill ios-mobile-project-pill--utility"
              aria-label="\u6253\u5f00\u63d0\u793a\u8bcd\u5e93"
              title="\u63d0\u793a\u8bcd\u5e93"
            >
              <span className="ios-mobile-project-pill-icon ios-mobile-project-pill-icon--teal">
                <ScrollText size={18} />
              </span>
              <span className="ios-mobile-project-pill-copy">
                <span className="ios-mobile-project-pill-label">{'\u5de5\u5177'}</span>
                <span className="ios-mobile-project-pill-value">{'\u63d0\u793a\u8bcd\u5e93'}</span>
              </span>
            </button>

            <button
              type="button"
              onClick={onTogglePromptOptimization}
              className={`ios-mobile-project-pill ios-mobile-project-pill--utility ${promptOptimizationEnabled ? 'is-active' : ''}`}
              aria-label="\u5207\u6362\u63d0\u793a\u8bcd\u4f18\u5316"
              title={promptOptimizationSupported
                ? (promptOptimizationEnabled ? '\u5df2\u5f00\u542f\u63d0\u793a\u8bcd\u4f18\u5316' : '\u542f\u7528\u63d0\u793a\u8bcd\u4f18\u5316')
                : '\u5f53\u524d\u6a21\u578b\u4e0d\u652f\u6301\u63d0\u793a\u8bcd\u4f18\u5316'}
              disabled={!promptOptimizationSupported}
            >
              <span className="ios-mobile-project-pill-icon ios-mobile-project-pill-icon--green">
                <Wand2 size={18} />
              </span>
              <span className="ios-mobile-project-pill-copy">
                <span className="ios-mobile-project-pill-label">{'\u4f18\u5316'}</span>
                <span className="ios-mobile-project-pill-value">
                  {promptOptimizationSupported
                    ? (promptOptimizationEnabled ? '\u5df2\u5f00\u542f\u4f18\u5316' : '\u4f18\u5316\u63d0\u793a\u8bcd')
                    : '\u5f53\u524d\u4e0d\u53ef\u7528'}
                </span>
              </span>
            </button>
          </div>
        </div>
      </div>

      {showProjects ? (
        <button
          type="button"
          aria-label="\u5173\u95ed\u9879\u76ee\u5217\u8868"
          className="fixed inset-0 z-[964] cursor-default bg-transparent md:hidden"
          onClick={() => setShowProjects(false)}
        />
      ) : null}
    </>
  );
};

export default MobileWorkspaceQuickBar;
