import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import {
  FileSpreadsheet,
  ArrowRight,
  ArrowLeft,
  Download,
  Plus,
  Sparkles,
  CheckCircle2,
  X,
  AlertCircle,
} from 'lucide-react'
import { useEventContext } from '@/contexts/event-context'
import { importContacts, classifyContact } from '@/services/contacts'
import { createEvent } from '@/services/events'
import { parseXLSXFile } from '@/lib/xlsx-parser'
import { extractFieldErrors, getErrorMessage, type FieldErrors } from '@/lib/errors'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/hooks/use-toast'

// Teto para a classificacao automatica pos-importacao (ver comentario no
// handleStartImport). Acima disso, classificar em lote pela tela Contatos.
const AUTO_CLASSIFY_LIMIT = 200

const AVAILABLE_EXTRA_FIELDS = [
  { value: 'raw_role', label: 'Cargo Original' },
  { value: 'rsvp', label: 'Status RSVP' },
  { value: 'has_degree', label: 'Possui Diploma' },
  { value: 'notes', label: 'Observações' },
]

interface DefaultMapping {
  name: string
  email: string
  phone: string
  company: string
  cnpj: string
}

interface ExtraFieldMapping {
  field: string
  column: string
}

export default function Import() {
  const { events, selectedEventId, refreshEvents, setSelectedEventId } = useEventContext()
  const { toast } = useToast()

  const [step, setStep] = useState<1 | 2 | 3>(1)
  const [csvHeaders, setCsvHeaders] = useState<string[]>([])
  const [csvRows, setCsvRows] = useState<string[][]>([])
  const [defaultMapping, setDefaultMapping] = useState<DefaultMapping>({
    name: '',
    email: '',
    phone: '',
    company: '',
    cnpj: '',
  })
  const [extraFields, setExtraFields] = useState<ExtraFieldMapping[]>([])

  const [targetEventId, setTargetEventId] = useState<string>(selectedEventId || '')
  const [allowDuplicates, setAllowDuplicates] = useState<boolean>(false)
  const [newEventOpen, setNewEventOpen] = useState(false)
  const [newEventName, setNewEventName] = useState('')
  const [eventFieldErrors, setEventFieldErrors] = useState<FieldErrors>({})

  const [importing, setImporting] = useState(false)
  const [importProgress, setImportProgress] = useState(0)
  const [importError, setImportError] = useState<string>('')
  const [importReport, setImportReport] = useState<{
    imported: number
    skipped: number
    blocked: number
    errors: Array<{ row: number; reason: string }>
    imported_ids?: string[]
  } | null>(null)

  const [classifying, setClassifying] = useState(false)
  const [classifyProgress, setClassifyProgress] = useState(0)
  const [classifiedCount, setClassifiedCount] = useState(0)
  const [totalToClassify, setTotalToClassify] = useState(0)

  useEffect(() => {
    if (selectedEventId && !targetEventId) {
      setTargetEventId(selectedEventId)
    }
  }, [selectedEventId, targetEventId])

  const handleParsedData = (headers: string[], dataRows: string[][]) => {
    if (headers.length === 0 || dataRows.length === 0) {
      toast({
        title: 'Arquivo inválido',
        description: 'O arquivo precisa ter pelo menos um cabeçalho e uma linha de dados.',
      })
      return
    }
    setCsvHeaders(headers)
    setCsvRows(dataRows)
    setDefaultMapping({
      name: headers.find((h) => /nome/i.test(h)) || '',
      email: headers.find((h) => /e-?mail/i.test(h)) || '',
      phone: headers.find((h) => /tel|fone|celular/i.test(h)) || '',
      company: headers.find((h) => /empresa|organiza/i.test(h)) || '',
      cnpj: headers.find((h) => /cnpj/i.test(h)) || '',
    })
    setExtraFields([])
    setStep(2)
  }

  const parseCSV = (content: string) => {
    const lines = content.split(/\r\n|\n/).filter((l) => l.trim().length > 0)
    if (lines.length < 2) {
      toast({
        title: 'Arquivo inválido',
        description: 'O CSV precisa ter pelo menos um cabeçalho e uma linha de dados.',
      })
      return
    }
    const firstLine = lines[0]
    const delimiter = firstLine.includes(';') ? ';' : ','
    const headers = firstLine.split(delimiter).map((h) => h.replace(/^"|"$/g, '').trim())
    const dataRows = lines
      .slice(1)
      .map((line) => line.split(delimiter).map((c) => c.replace(/^"|"$/g, '').trim()))
    handleParsedData(headers, dataRows)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const name = file.name.toLowerCase()
    if (name.endsWith('.csv')) {
      const reader = new FileReader()
      reader.onload = (event) => parseCSV(event.target?.result as string)
      reader.readAsText(file)
    } else if (name.endsWith('.xlsx')) {
      try {
        const { headers, rows } = await parseXLSXFile(file)
        handleParsedData(headers, rows)
      } catch {
        toast({ title: 'Erro ao processar XLSX', description: 'Não foi possível ler o arquivo.' })
      }
    } else {
      toast({ title: 'Formato não suportado', description: 'Envie um arquivo .csv ou .xlsx' })
    }
    e.target.value = ''
  }

  const handleCreateNewEvent = async () => {
    if (!newEventName.trim()) return
    try {
      setEventFieldErrors({})
      const created = await createEvent({ name: newEventName.trim() })
      await refreshEvents()
      setTargetEventId(created.id)
      setSelectedEventId(created.id)
      setNewEventOpen(false)
      setNewEventName('')
      toast({ title: 'Mailing (lista) criado com sucesso!' })
    } catch (err) {
      const fieldErrs = extractFieldErrors(err)
      setEventFieldErrors(fieldErrs)
      toast({
        title: 'Erro ao criar mailing (lista)',
        description: getErrorMessage(err),
      })
    }
  }

  const handleStartImport = async () => {
    if (!targetEventId) {
      toast({ title: 'Selecione um mailing (lista) para associar os contatos.' })
      return
    }
    if (!defaultMapping.name || !defaultMapping.email) {
      toast({
        title: 'Mapeamento incompleto',
        description: 'Nome e E-mail são campos obrigatórios.',
      })
      return
    }

    setStep(3)
    setImporting(true)
    setImportProgress(20)
    setImportReport(null)
    setImportError('')
    setClassifiedCount(0)

    const idx = (key: string) => csvHeaders.indexOf(key)
    const payload = csvRows.map((row) => {
      const obj: { name: string; email: string; [key: string]: string } = {
        name: idx(defaultMapping.name) >= 0 ? row[idx(defaultMapping.name)] : '',
        email: idx(defaultMapping.email) >= 0 ? row[idx(defaultMapping.email)] : '',
        phone: idx(defaultMapping.phone) >= 0 ? row[idx(defaultMapping.phone)] : '',
        company: idx(defaultMapping.company) >= 0 ? row[idx(defaultMapping.company)] : '',
        cnpj: idx(defaultMapping.cnpj) >= 0 ? row[idx(defaultMapping.cnpj)] : '',
      }
      extraFields.forEach(({ field, column }) => {
        const colIdx = csvHeaders.indexOf(column)
        if (colIdx >= 0 && field) obj[field] = row[colIdx]
      })
      return obj
    })

    setImportProgress(10)

    try {
      // O envio vai em lotes: o progresso reflete quantas linhas ja foram
      // processadas de verdade, nao um valor fixo.
      const result = await importContacts(targetEventId, payload, allowDuplicates, (done, total) => {
        setImportProgress(10 + Math.round((done / total) * 85))
      })
      setImportReport(result)
      setImportProgress(100)
      toast({ title: 'Importação concluída!' })

      // A classificacao roda um contato por vez (uma chamada de function
      // cada). Numa planilha grande isso levaria horas e daria a impressao
      // de travamento logo apos a importacao ja ter terminado, entao ela e
      // limitada aqui - o restante fica disponivel em Contatos, onde da
      // para selecionar e classificar em lote quando quiser.
      const allIds = result.imported_ids || []
      const ids = allIds.slice(0, AUTO_CLASSIFY_LIMIT)
      if (ids.length > 0) {
        setTotalToClassify(ids.length)
        setClassifying(true)
        setClassifyProgress(0)
        setClassifiedCount(0)
        let count = 0
        for (let i = 0; i < ids.length; i++) {
          try {
            await classifyContact(ids[i])
            count++
            setClassifiedCount(count)
          } catch (err) {
            console.error('Classification failed:', err)
          }
          setClassifyProgress(Math.round(((i + 1) / ids.length) * 100))
        }
        setClassifying(false)
        const restantes = allIds.length - ids.length
        toast({
          title: 'Classificação IA concluída!',
          description:
            restantes > 0
              ? `${count} contatos classificados. Os outros ${restantes} ficaram como Pendente — classifique em lote pela tela de Contatos.`
              : `${count} contatos classificados com sucesso!`,
        })
      }
    } catch (err) {
      setImportError(getErrorMessage(err))
      toast({
        title: 'Erro durante a importação',
        description: getErrorMessage(err),
      })
    } finally {
      setImporting(false)
    }
  }

  const downloadErrorReport = () => {
    if (!importReport || importReport.errors.length === 0) return
    const csvLines = [
      'Linha;Motivo do erro',
      ...importReport.errors.map((e) => `${e.row};"${e.reason}"`),
    ].join('\n')
    const blob = new Blob(['\uFEFF' + csvLines], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'relatorio_erros_importacao.csv'
    link.click()
  }

  const addExtraField = () => {
    const usedFields = extraFields.map((f) => f.field)
    const available = AVAILABLE_EXTRA_FIELDS.find((f) => !usedFields.includes(f.value))
    if (available) {
      setExtraFields([...extraFields, { field: available.value, column: '' }])
    } else {
      toast({ title: 'Todos os campos adicionais já foram adicionados.' })
    }
  }

  const updateExtraField = (index: number, key: keyof ExtraFieldMapping, value: string) => {
    setExtraFields(extraFields.map((f, i) => (i === index ? { ...f, [key]: value } : f)))
  }

  const removeExtraField = (index: number) => {
    setExtraFields(extraFields.filter((_, i) => i !== index))
  }

  const renderColumnSelect = (key: keyof DefaultMapping, label: string, required?: boolean) => (
    <div className="space-y-1">
      <Label className="text-xs font-semibold">
        {label} {required && '*'}
      </Label>
      <Select
        value={defaultMapping[key]}
        onValueChange={(val) => setDefaultMapping({ ...defaultMapping, [key]: val })}
      >
        <SelectTrigger className="h-9 text-xs">
          <SelectValue placeholder="Selecione a coluna" />
        </SelectTrigger>
        <SelectContent>
          {csvHeaders.map((h) => (
            <SelectItem key={h} value={h} className="text-xs">
              {h}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  const getAvailableExtraOptions = (currentField: string) =>
    AVAILABLE_EXTRA_FIELDS.filter(
      (f) => f.value === currentField || !extraFields.some((ef) => ef.field === f.value),
    )

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl mx-auto pb-12">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Importar Mailing (lista)
        </h1>
        <p className="text-xs text-slate-500">
          Envie planilhas CSV ou XLSX para higienização e classificação automática com IA
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold border-b border-slate-200 pb-3">
        {['1. Envio do arquivo', '2. Mapeamento', '3. Resultado'].map((label, i) => (
          <div
            key={label}
            className={`flex items-center justify-center gap-1.5 ${step === i + 1 ? 'text-indigo-600 border-b-2 border-indigo-600 pb-2' : 'text-slate-400'}`}
          >
            <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-[10px]">
              {i + 1}
            </span>
            <span>{label}</span>
          </div>
        ))}
      </div>

      {step === 1 && (
        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              Selecione o arquivo da sua planilha
            </CardTitle>
            <CardDescription className="text-xs">
              Formatos suportados: <strong>CSV</strong> e <strong>XLSX</strong> (Excel)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center hover:border-indigo-500 transition-colors bg-slate-50/50 relative">
              <FileSpreadsheet className="w-10 h-10 text-indigo-500 mx-auto mb-3" />
              <p className="text-xs font-bold text-slate-800 mb-1">
                Arraste seu arquivo ou clique para procurar
              </p>
              <p className="text-[11px] text-slate-400 mb-4">Suporta arquivos .csv e .xlsx</p>
              <input
                type="file"
                accept=".csv,.xlsx"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <Button
                size="sm"
                className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs pointer-events-none"
              >
                Selecionar arquivo
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-900">
                1. Associar ao Mailing (lista)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <Select value={targetEventId} onValueChange={setTargetEventId}>
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Selecione o mailing (lista) destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {events.map((evt) => (
                        <SelectItem key={evt.id} value={evt.id} className="text-xs">
                          {evt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setNewEventOpen(true)}
                  className="h-9 text-xs gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Novo mailing (lista)</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-bold text-slate-900">
                2. Mapeamento de Colunas
              </CardTitle>
              <CardDescription className="text-xs">
                Campos padrão pré-preenchidos. Adicione campos adicionais conforme necessário (*
                campos obrigatórios)
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                  Campos Padrão
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {renderColumnSelect('name', 'Nome Completo', true)}
                  {renderColumnSelect('email', 'E-mail', true)}
                  {renderColumnSelect('phone', 'Telefone')}
                  {renderColumnSelect('company', 'Empresa')}
                  {renderColumnSelect('cnpj', 'CNPJ')}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-700 uppercase tracking-wide">
                    Campos Adicionais
                  </Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addExtraField}
                    className="text-xs gap-1 h-8"
                    disabled={extraFields.length >= AVAILABLE_EXTRA_FIELDS.length}
                  >
                    <Plus className="w-3 h-3" />
                    <span>Adicionar campo</span>
                  </Button>
                </div>
                {extraFields.length === 0 && (
                  <p className="text-[11px] text-slate-400 italic">
                    Nenhum campo adicional. Clique em "Adicionar campo" para mapear Cargo, RSVP,
                    Diploma ou Observações.
                  </p>
                )}
                {extraFields.map((extra, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <Select
                      value={extra.field}
                      onValueChange={(val) => updateExtraField(idx, 'field', val)}
                    >
                      <SelectTrigger className="h-9 text-xs w-44 shrink-0">
                        <SelectValue placeholder="Campo" />
                      </SelectTrigger>
                      <SelectContent>
                        {getAvailableExtraOptions(extra.field).map((f) => (
                          <SelectItem key={f.value} value={f.value} className="text-xs">
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Select
                      value={extra.column}
                      onValueChange={(val) => updateExtraField(idx, 'column', val)}
                    >
                      <SelectTrigger className="h-9 text-xs flex-1">
                        <SelectValue placeholder="Selecione a coluna" />
                      </SelectTrigger>
                      <SelectContent>
                        {csvHeaders.map((h) => (
                          <SelectItem key={h} value={h} className="text-xs">
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeExtraField(idx)}
                      className="h-9 px-2 shrink-0"
                    >
                      <X className="w-3.5 h-3.5 text-slate-400" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="pt-4 border-t border-slate-100 space-y-2">
                <Label className="text-xs font-semibold text-slate-800">
                  Tratamento de Duplicados
                </Label>
                <RadioGroup
                  value={allowDuplicates ? 'allow' : 'skip'}
                  onValueChange={(val) => setAllowDuplicates(val === 'allow')}
                  className="flex gap-4 text-xs"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="skip" id="r-skip" />
                    <label htmlFor="r-skip" className="cursor-pointer text-slate-700">
                      Pular e-mails duplicados (Recomendado)
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="allow" id="r-allow" />
                    <label htmlFor="r-allow" className="cursor-pointer text-slate-700">
                      Importar mesmo assim
                    </label>
                  </div>
                </RadioGroup>
              </div>

              <div className="pt-4 flex justify-between">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setStep(1)}
                  className="text-xs gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Voltar</span>
                </Button>
                <Button
                  onClick={handleStartImport}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-6 gap-2"
                >
                  <span>Iniciar Importação ({csvRows.length} linhas)</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === 3 && (
        <Card className="border-slate-200 shadow-xs">
          <CardHeader>
            <CardTitle className="text-base font-bold text-slate-900">
              {importing
                ? 'Processando Importação...'
                : classifying
                  ? 'Classificando com IA...'
                  : 'Relatório de Importação'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {importing && (
              <div className="space-y-3 py-6">
                <Progress value={importProgress} className="h-3" />
                <p className="text-xs text-center text-slate-500">
                  Gravando participantes na base do mailing (lista)...
                </p>
              </div>
            )}

            {!importing && importError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-50 border border-rose-200">
                <AlertCircle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="text-xs font-bold text-rose-800">Erro na importação</p>
                  <p className="text-xs text-rose-700">{importError}</p>
                </div>
              </div>
            )}

            {!importing && importReport && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                  <div className="p-4 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-100">
                    <h4 className="text-2xl font-extrabold">{importReport.imported}</h4>
                    <p className="text-xs font-semibold">Importados</p>
                  </div>
                  <div className="p-4 rounded-lg bg-amber-50 text-amber-800 border border-amber-100">
                    <h4 className="text-2xl font-extrabold">{importReport.skipped}</h4>
                    <p className="text-xs font-semibold">Duplicados</p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-100 text-slate-800 border border-slate-200">
                    <h4 className="text-2xl font-extrabold">{importReport.blocked || 0}</h4>
                    <p className="text-xs font-semibold">Bloqueados</p>
                  </div>
                  <div className="p-4 rounded-lg bg-rose-50 text-rose-800 border border-rose-100">
                    <h4 className="text-2xl font-extrabold">{importReport.errors.length}</h4>
                    <p className="text-xs font-semibold">Erros</p>
                  </div>
                </div>

                {importReport.blocked > 0 && (
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 border border-slate-200">
                    <AlertCircle className="w-4 h-4 text-slate-600 mt-0.5 shrink-0" />
                    <span className="text-xs text-slate-700">
                      {importReport.blocked} contato(s) bloqueado(s) foram pulados — encontrados na
                      lista de descadastro.
                    </span>
                  </div>
                )}

                {importReport.errors.length > 0 && (
                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900">
                        Linhas com falhas de validação:
                      </h4>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={downloadErrorReport}
                        className="text-xs gap-1.5 h-8"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Baixar relatório (CSV)</span>
                      </Button>
                    </div>
                    <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-lg">
                      <Table>
                        <TableHeader className="bg-slate-50">
                          <TableRow>
                            <TableHead className="text-xs font-bold w-20">Linha</TableHead>
                            <TableHead className="text-xs font-bold">Motivo do Erro</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {importReport.errors.map((err, idx) => (
                            <TableRow key={idx}>
                              <TableCell className="text-xs font-semibold">#{err.row}</TableCell>
                              <TableCell className="text-xs text-rose-600">{err.reason}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}

                {classifying && (
                  <div className="space-y-3 border-t border-slate-100 pt-4">
                    <div className="flex items-center gap-2 text-indigo-700">
                      <Sparkles className="w-4 h-4 animate-pulse" />
                      <span className="text-xs font-bold">Classificação IA em andamento...</span>
                    </div>
                    <Progress value={classifyProgress} className="h-3" />
                    <p className="text-xs text-center text-slate-500">
                      {classifiedCount} de {totalToClassify} contatos classificados
                    </p>
                  </div>
                )}

                {!classifying && classifiedCount > 0 && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-indigo-50 border border-indigo-100">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs text-indigo-800 font-medium">
                      {classifiedCount} contatos classificados com IA! Perfis, interesses e
                      mensagens personalizadas foram gerados.
                    </span>
                  </div>
                )}

                {!classifying && (
                  <div className="flex justify-between pt-4 border-t border-slate-100">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setStep(1)
                        setImportReport(null)
                        setImportError('')
                        setClassifiedCount(0)
                      }}
                      className="text-xs"
                    >
                      Importar outro arquivo
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs gap-1.5"
                    >
                      <Link to="/contatos">
                        <span>Ver contatos do evento</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={newEventOpen} onOpenChange={setNewEventOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Criar Novo Mailing (lista)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label className="text-xs font-semibold">Nome do Mailing (lista)</Label>
            <Input
              placeholder="Ex: Convenção Anual de RH 2026"
              value={newEventName}
              onChange={(e) => setNewEventName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateNewEvent()}
              className="text-xs h-9"
            />
            {eventFieldErrors.name && (
              <p className="text-xs text-rose-500">{eventFieldErrors.name}</p>
            )}
            {eventFieldErrors.owner && (
              <p className="text-xs text-rose-500">{eventFieldErrors.owner}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setNewEventOpen(false)
                setEventFieldErrors({})
              }}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              size="sm"
              onClick={handleCreateNewEvent}
              className="bg-indigo-600 text-white text-xs"
            >
              Criar Mailing
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
