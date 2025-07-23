" MCP.vim - MCP (Model Context Protocol) support for Vim/Neovim
" Maintainer: MCP Team
" Version: 1.0.0

if exists('g:loaded_mcp')
  finish
endif
let g:loaded_mcp = 1

" Configuration
let g:mcp_api_key = get(g:, 'mcp_api_key', '')
let g:mcp_endpoint = get(g:, 'mcp_endpoint', 'http://localhost:8080')
let g:mcp_enable_diagnostics = get(g:, 'mcp_enable_diagnostics', 1)
let g:mcp_enable_completion = get(g:, 'mcp_enable_completion', 1)

" Commands
command! -nargs=0 MCPShowServices call mcp#ShowServices()
command! -nargs=1 MCPInstallService call mcp#InstallService(<q-args>)
command! -nargs=1 MCPServiceDetails call mcp#ShowServiceDetails(<q-args>)
command! -nargs=0 MCPRefresh call mcp#RefreshServices()
command! -nargs=0 MCPHealthCheck call mcp#ShowHealth()

" Key mappings
nnoremap <silent> <leader>ms :MCPShowServices<CR>
nnoremap <silent> <leader>mi :call mcp#InstallServicePrompt()<CR>
nnoremap <silent> <leader>mr :MCPRefresh<CR>
nnoremap <silent> <leader>mh :MCPHealthCheck<CR>

" Autocommands
augroup MCP
  autocmd!
  " Enable completion for supported file types
  if g:mcp_enable_completion
    autocmd FileType javascript,typescript,python,go call mcp#EnableCompletion()
  endif
  
  " Enable diagnostics for MCP config files
  if g:mcp_enable_diagnostics
    autocmd BufRead,BufWrite *.mcp.json,mcp.config.json call mcp#UpdateDiagnostics()
  endif
  
  " Set filetype for MCP config files
  autocmd BufRead,BufNewFile *.mcp.json,mcp.config.json set filetype=mcp-config
augroup END

" Sign definitions for diagnostics
sign define MCPError text=✗ texthl=ErrorMsg
sign define MCPWarning text=⚠ texthl=WarningMsg
sign define MCPInfo text=ℹ texthl=Question

" Completion setup for Neovim
if has('nvim')
  lua << EOF
  -- Setup MCP completion source for nvim-cmp
  local has_cmp, cmp = pcall(require, 'cmp')
  if has_cmp then
    local source = {}
    
    source.new = function()
      return setmetatable({}, { __index = source })
    end
    
    source.get_trigger_characters = function()
      return { '.', '"', "'" }
    end
    
    source.complete = function(self, params, callback)
      local items = vim.fn['mcp#GetCompletionItems'](
        params.context.cursor_before_line,
        params.context.cursor.col
      )
      callback({ items = items, isIncomplete = false })
    end
    
    cmp.register_source('mcp', source.new())
  end
EOF
endif