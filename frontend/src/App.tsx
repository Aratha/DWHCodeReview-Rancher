import { useState } from 'react'
import { LiveReviewModal } from './components/LiveReviewModal'
import { ReviewResultsModal } from './components/ReviewResultsModal'
import { Sidebar, type AppView } from './components/Sidebar'
import { ReviewAnalysisProvider } from './contexts/ReviewAnalysisContext'
import { LlmConfigPage } from './pages/LlmConfigPage'
import { AnalysisHistoryPage } from './pages/AnalysisHistoryPage'
import { ReviewPage } from './pages/ReviewPage'
import { RulesPage } from './pages/RulesPage'
import { ScriptReviewPage } from './pages/ScriptReviewPage'

function App() {
  const [view, setView] = useState<AppView>('review')

  return (
    <ReviewAnalysisProvider>
      <LiveReviewModal />
      <ReviewResultsModal />
      <div className="flex h-dvh min-h-0">
        <Sidebar active={view} onNavigate={setView} />
        <main className="flex min-h-0 min-w-0 flex-1 flex-col p-6 lg:p-10">
          {view === 'review' ? (
            <ReviewPage />
          ) : view === 'paste' ? (
            <ScriptReviewPage />
          ) : view === 'rules' ? (
            <RulesPage />
          ) : view === 'llm' ? (
            <LlmConfigPage />
          ) : (
            <AnalysisHistoryPage />
          )}
        </main>
      </div>
    </ReviewAnalysisProvider>
  )
}

export default App
