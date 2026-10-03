import { Body, Controller, Get, HttpCode, Param, Post, Put, Query } from '@nestjs/common';
import {
  CATALOG_EDITOR_ROLES,
  createProposalRequestSchema,
  type Paginated,
  type Proposal,
  type ProposalListQuery,
  proposalListQuerySchema,
  type ProposalSummary,
  type PublishProposalRequest,
  publishProposalRequestSchema,
  type UpdateProposalDraftRequest,
  updateProposalDraftRequestSchema,
} from '@travel-rock/shared';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import type { AuthenticatedStaff } from '../staff-auth/authenticated-staff.js';
import { CurrentStaff, Roles } from '../staff-auth/decorators.js';
import { toProposalDto, toProposalSummaryDto } from './proposal.mapper.js';
import { ProposalsService } from './proposals.service.js';

const proposalIdPipe = new ZodValidationPipe(z.uuid());

/** Read: every staff role. Create, edit, publish and archive: ADMIN and COMMERCIAL (B6). */
@Controller('admin/proposals')
export class ProposalsController {
  constructor(private readonly proposals: ProposalsService) {}

  @Get()
  async list(
    @Query(new ZodValidationPipe(proposalListQuerySchema)) query: ProposalListQuery,
  ): Promise<Paginated<ProposalSummary>> {
    const page = await this.proposals.list(query);
    return { ...page, items: page.items.map(toProposalSummaryDto) };
  }

  @Get(':id')
  async get(@Param('id', proposalIdPipe) id: string): Promise<Proposal> {
    return toProposalDto(await this.proposals.get(id));
  }

  @Post()
  @Roles(...CATALOG_EDITOR_ROLES)
  async create(
    @Body(new ZodValidationPipe(createProposalRequestSchema)) body: { schoolGroupId: string },
    @CurrentStaff() actor: AuthenticatedStaff,
  ): Promise<Proposal> {
    return toProposalDto(await this.proposals.createDraft(body.schoolGroupId, actor));
  }

  @Put(':id')
  @Roles(...CATALOG_EDITOR_ROLES)
  async replaceDraft(
    @Param('id', proposalIdPipe) id: string,
    @Body(new ZodValidationPipe(updateProposalDraftRequestSchema)) body: UpdateProposalDraftRequest,
  ): Promise<Proposal> {
    return toProposalDto(await this.proposals.replaceDraft(id, body));
  }

  @Post(':id/versions')
  @Roles(...CATALOG_EDITOR_ROLES)
  async clone(
    @Param('id', proposalIdPipe) id: string,
    @CurrentStaff() actor: AuthenticatedStaff,
  ): Promise<Proposal> {
    return toProposalDto(await this.proposals.cloneToNewVersion(id, actor));
  }

  @Post(':id/publish')
  @HttpCode(200)
  @Roles(...CATALOG_EDITOR_ROLES)
  async publish(
    @Param('id', proposalIdPipe) id: string,
    @Body(new ZodValidationPipe(publishProposalRequestSchema)) body: PublishProposalRequest,
    @CurrentStaff() actor: AuthenticatedStaff,
  ): Promise<Proposal> {
    return toProposalDto(await this.proposals.publish(id, actor, body.expectedUpdatedAt));
  }

  @Post(':id/archive')
  @HttpCode(200)
  @Roles(...CATALOG_EDITOR_ROLES)
  async archive(@Param('id', proposalIdPipe) id: string): Promise<Proposal> {
    return toProposalDto(await this.proposals.archive(id));
  }
}
