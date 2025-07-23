package com.mcp.ide;

import com.intellij.codeInsight.completion.*;
import com.intellij.codeInsight.lookup.LookupElementBuilder;
import com.intellij.patterns.PlatformPatterns;
import com.intellij.psi.*;
import com.intellij.util.ProcessingContext;
import org.jetbrains.annotations.NotNull;

import java.util.Arrays;
import java.util.List;

public class MCPCompletionContributor extends CompletionContributor {
    
    private static final List<String> MCP_METHODS = Arrays.asList(
        "connectService",
        "installService",
        "listServices",
        "callService",
        "getService",
        "getHealth"
    );
    
    private static final List<String> MCP_SERVICES = Arrays.asList(
        "postgres-mcp",
        "mysql-mcp",
        "redis-mcp",
        "api-service"
    );
    
    public MCPCompletionContributor() {
        // Add completion for mcp. methods
        extend(CompletionType.BASIC,
            PlatformPatterns.psiElement().afterLeaf(".").afterLeaf("mcp"),
            new CompletionProvider<CompletionParameters>() {
                @Override
                protected void addCompletions(@NotNull CompletionParameters parameters,
                                            @NotNull ProcessingContext context,
                                            @NotNull CompletionResultSet result) {
                    for (String method : MCP_METHODS) {
                        result.addElement(LookupElementBuilder.create(method)
                            .withTypeText("MCP Method")
                            .withIcon(MCPIcons.METHOD));
                    }
                }
            }
        );
        
        // Add completion for service names in string literals
        extend(CompletionType.BASIC,
            PlatformPatterns.psiElement().inside(PsiLiteralExpression.class),
            new CompletionProvider<CompletionParameters>() {
                @Override
                protected void addCompletions(@NotNull CompletionParameters parameters,
                                            @NotNull ProcessingContext context,
                                            @NotNull CompletionResultSet result) {
                    PsiElement position = parameters.getPosition();
                    PsiElement parent = position.getParent();
                    
                    if (parent instanceof PsiLiteralExpression) {
                        String text = parent.getText();
                        
                        // Check if we're in a method call that expects a service ID
                        PsiElement methodCall = parent.getParent();
                        if (methodCall != null && methodCall.getText().contains("Service")) {
                            for (String service : MCP_SERVICES) {
                                result.addElement(LookupElementBuilder.create(service)
                                    .withTypeText("MCP Service")
                                    .withIcon(MCPIcons.SERVICE));
                            }
                        }
                    }
                }
            }
        );
    }
}