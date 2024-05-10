import { logger } from './application-logger';
import { AssignmentCache } from './assignment-cache';
import { IAssignmentHooks } from './assignment-hooks';
import { IAssignmentLogger, IAssignmentEvent } from './assignment-logger';
import EppoClient, { FlagConfigurationRequestParameters, IEppoClient } from './client/eppo-client';
import {
  IConfigurationStore,
  IAsyncStore,
  ISyncStore,
} from './configuration-store/configuration-store';
import { HybridConfigurationStore } from './configuration-store/hybrid.store';
import { MemoryOnlyConfigurationStore } from './configuration-store/memory.store';
import * as constants from './constants';
import FlagConfigRequestor from './flag-configuration-requestor';
import HttpClient from './http-client';
import { Flag, VariationType } from './interfaces';
import { AttributeType, SubjectAttributes } from './types';
import * as validation from './validation';

export {
  logger as applicationLogger,
  IAssignmentHooks,
  IAssignmentLogger,
  IAssignmentEvent,
  EppoClient,
  IEppoClient,
  constants,
  FlagConfigRequestor,
  HttpClient,
  validation,

  // Configuration store
  IConfigurationStore,
  IAsyncStore,
  ISyncStore,
  HybridConfigurationStore,
  MemoryOnlyConfigurationStore,

  //
  AssignmentCache,
  FlagConfigurationRequestParameters,
  Flag,
  VariationType,
  AttributeType,
  SubjectAttributes,
};
