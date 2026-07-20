import { Component } from 'react'
import { AlertTriangle } from 'lucide-react'

/**
 * Sans cette barrière, une erreur de rendu dans le lecteur PDF ou dans un
 * graphique Recharts produit un écran blanc, sans message ni recours.
 * Doit rester un composant classe : React n'expose pas d'équivalent en hooks.
 */
export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('Erreur de rendu non rattrapée:', error, info)
  }

  render() {
    if (!this.state.error) return this.props.children

    return (
      <div className="min-h-screen bg-bgMain flex flex-col justify-center items-center p-4 text-center font-arabic">
        <div className="bg-white border border-cardBorder rounded-custom p-8 shadow-sm max-w-md w-full">
          <AlertTriangle className="w-16 h-16 text-danger mx-auto mb-4" />
          <h2 className="text-lg font-bold text-textPrimary mb-2">حدث خطأ غير متوقع</h2>
          <p className="text-sm text-textSecondary mb-6 font-medium">
            نعتذر، حدث خلل أثناء عرض هذه الصفحة. يمكنك المحاولة مرة أخرى.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={() => this.setState({ error: null })}
              className="w-full py-2.5 bg-primary text-white font-bold rounded-custom hover:bg-primary/90 transition-colors"
            >
              إعادة المحاولة
            </button>
            <button
              onClick={() => { window.location.href = '/member' }}
              className="w-full py-2.5 bg-primary-light text-primary font-bold rounded-custom hover:bg-primary hover:text-white transition-colors"
            >
              العودة إلى المكتبة
            </button>
          </div>
        </div>
      </div>
    )
  }
}
